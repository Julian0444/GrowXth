#!/usr/bin/env python3
"""Scraper de eventos de Luma para San Francisco.

Un solo archivo, sin imports relativos (no es un paquete). Dos fases:

  phase1  extracción cruda: pagina el discover de SF y vuelca el JSON crudo a
          data/raw/luma-sf.json ANTES de normalizar. Imprime keys/tipos de la
          primera entry. Retries con backoff en 429/5xx. Rate limit 1 req/s.

  phase2  normalización: lee data/raw/luma-sf.json (SIN tocar la red) y escribe
          frontend/data/seed/{sf-events,sf-communities,sf-organizers}.json
          mapeados a lib/contracts/growxth.ts.

Uso:
    python scripts/scrape_luma.py phase1
    python scripts/scrape_luma.py phase2

Contexto verificado contra api.luma.com el 2026-07-23 (scraper previo del
proyecto). Los paths del JSON NO están documentados y cambian entre endpoints:
por eso todo campo se lee con dig(obj, *candidate_paths).
"""

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
API_BASE = "https://api.luma.com"
ENDPOINT = "/discover/get-paginated-events"
SF_PLACE_API_ID = "discplace-BDj7GNbGlsF7Cka"
PAGINATION_LIMIT = 50
MAX_EVENTS = 200
RATE_LIMIT_SECONDS = 1.0
MAX_RETRIES = 5
USER_AGENT = "GrowXth-Scraper/1.0 (+https://github.com/growxth; contact: mcavalie@kriptos.io)"

ROOT = Path(__file__).resolve().parent.parent
RAW_PATH = ROOT / "data" / "raw" / "luma-sf.json"
SEED_DIR = ROOT / "frontend" / "data" / "seed"

# Bounding boxes aproximados de barrios de SF (lat_min, lat_max, lng_min, lng_max).
# Si un evento no cae en ninguno, venueArea queda null (no se inventa).
NEIGHBORHOODS = [
    ("SoMa", 37.770, 37.789, -122.410, -122.393),
    ("Mission", 37.748, 37.770, -122.424, -122.406),
    ("FiDi", 37.789, 37.799, -122.404, -122.393),
    ("Hayes Valley", 37.772, 37.780, -122.430, -122.419),
]
# Caja amplia de SF, para confirmar "es SF" cuando falta el campo city.
SF_BBOX = (37.70, 37.83, -122.53, -122.35)


# --------------------------------------------------------------------------- #
# dig: prueba varios paths y devuelve el primero que exista
# --------------------------------------------------------------------------- #
def dig(obj, *candidate_paths, default=None):
    """Prueba varios paths (dot-notation) y devuelve el primer valor no-None.

    Cada path es un string tipo "event.geo_address_info.city". Los segmentos
    enteros indexan listas ("hosts.0.name"). Si ningún path existe, `default`.
    """
    for path in candidate_paths:
        cur = obj
        ok = True
        for segment in path.split("."):
            if isinstance(cur, dict) and segment in cur:
                cur = cur[segment]
            elif isinstance(cur, list) and segment.lstrip("-").isdigit():
                idx = int(segment)
                if -len(cur) <= idx < len(cur):
                    cur = cur[idx]
                else:
                    ok = False
                    break
            else:
                ok = False
                break
        if ok and cur is not None:
            return cur
    return default


# --------------------------------------------------------------------------- #
# FASE 1 — extracción cruda
# --------------------------------------------------------------------------- #
def _request_page(client, cursor):
    """Una página con retries + backoff en 429/5xx. Devuelve el JSON de la resp."""
    params = {
        "discover_place_api_id": SF_PLACE_API_ID,
        "pagination_limit": PAGINATION_LIMIT,
    }
    if cursor:
        params["pagination_cursor"] = cursor

    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = client.get(ENDPOINT, params=params)
        except httpx.HTTPError as exc:
            last_error = exc
            backoff = 2 ** attempt
            print(f"  network error ({exc}); retry en {backoff}s", file=sys.stderr)
            time.sleep(backoff)
            continue

        if resp.status_code == 429 or resp.status_code >= 500:
            retry_after = resp.headers.get("retry-after")
            backoff = float(retry_after) if retry_after and retry_after.isdigit() else 2 ** attempt
            print(f"  {resp.status_code}; retry en {backoff}s", file=sys.stderr)
            last_error = httpx.HTTPStatusError(f"status {resp.status_code}", request=resp.request, response=resp)
            time.sleep(backoff)
            continue

        resp.raise_for_status()
        return resp.json()

    raise RuntimeError(f"page falló tras {MAX_RETRIES} intentos: {last_error}")


def phase1():
    entries = []
    cursor = None
    pages = 0

    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    with httpx.Client(base_url=API_BASE, headers=headers, timeout=30.0) as client:
        while len(entries) < MAX_EVENTS:
            data = _request_page(client, cursor)
            page_entries = dig(data, "entries", default=[]) or []
            entries.extend(page_entries)
            pages += 1
            has_more = bool(dig(data, "has_more", default=False))
            cursor = dig(data, "next_cursor", "pagination_cursor")
            print(f"  página {pages}: +{len(page_entries)} (total {len(entries)}), has_more={has_more}")
            if not has_more or not cursor:
                break
            time.sleep(RATE_LIMIT_SECONDS)

    entries = entries[:MAX_EVENTS]

    RAW_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": API_BASE + ENDPOINT,
        "discover_place_api_id": SF_PLACE_API_ID,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "count": len(entries),
        "entries": entries,
    }
    RAW_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nCrudo volcado a {RAW_PATH} ({len(entries)} entries, {pages} páginas)")

    if entries:
        first = entries[0]
        print("\nSHAPE de la primera entry (key: tipo):")
        if isinstance(first, dict):
            for key, value in first.items():
                print(f"  {key}: {type(value).__name__}")
        else:
            print(f"  (entry no es dict, es {type(first).__name__})")
    else:
        print("\n(No llegaron entries — nada que mostrar.)")


# --------------------------------------------------------------------------- #
# FASE 2 — normalización al contrato
# --------------------------------------------------------------------------- #
def slugify(text):
    slug = re.sub(r"[^a-z0-9]+", "-", (text or "").strip().lower()).strip("-")
    return slug or "unknown"


def neighborhood_of(lat, lng):
    if lat is None or lng is None:
        return None
    for name, lat_min, lat_max, lng_min, lng_max in NEIGHBORHOODS:
        if lat_min <= lat <= lat_max and lng_min <= lng <= lng_max:
            return name
    return None


def in_sf_bbox(lat, lng):
    if lat is None or lng is None:
        return False
    lat_min, lat_max, lng_min, lng_max = SF_BBOX
    return lat_min <= lat <= lat_max and lng_min <= lng <= lng_max


def as_float(value):
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def normalize_categories(raw):
    """categories puede ser lista de strings o de dicts {name}. → list[str]."""
    if not isinstance(raw, list):
        return []
    out = []
    for item in raw:
        if isinstance(item, str):
            out.append(item)
        elif isinstance(item, dict):
            name = dig(item, "name", "label", "title")
            if isinstance(name, str):
                out.append(name)
    return out


def is_future(start_at):
    if not start_at:
        return False
    try:
        dt = datetime.fromisoformat(str(start_at).replace("Z", "+00:00"))
    except ValueError:
        return False
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt > datetime.now(timezone.utc)


def extract_event_fields(entry):
    """Lee los campos que expone Luma con dig (paths no documentados)."""
    return {
        "api_id": dig(entry, "event.api_id", "api_id", "event.event_api_id"),
        "name": dig(entry, "event.name", "name"),
        "slug": dig(entry, "event.slug", "slug", "event.url"),
        "url": dig(entry, "event.url", "url"),
        "start_at": dig(entry, "event.start_at", "start_at"),
        "capacity": dig(entry, "event.capacity", "capacity"),
        "guest_count": dig(entry, "event.guest_count", "guest_count"),
        "is_online": dig(entry, "event.is_online", "is_online"),
        # Luma no expone is_online en discover; el online se marca en location_type.
        "location_type": dig(entry, "event.location_type", "location_type"),
        "city": dig(entry, "event.geo_address_info.city", "event.city", "city",
                    "event.geo_address_info.city_state"),
        "latitude": as_float(dig(entry, "event.coordinate.latitude", "event.geo_address_info.latitude",
                                 "event.latitude", "latitude", "geo_latitude")),
        "longitude": as_float(dig(entry, "event.coordinate.longitude", "event.geo_address_info.longitude",
                                  "event.longitude", "longitude", "geo_longitude")),
        "categories": normalize_categories(
            dig(entry, "event.categories", "categories", "event.tags", default=[])
        ),
        # calendar
        "calendar_api_id": dig(entry, "calendar.api_id", "hosting_calendar.api_id",
                               "event.calendar_api_id", "calendar_api_id"),
        "calendar_name": dig(entry, "calendar.name", "hosting_calendar.name", "calendar_name"),
        "calendar_slug": dig(entry, "calendar.slug", "hosting_calendar.slug", "calendar_slug"),
        "subscriber_count": dig(entry, "calendar.subscriber_count", "hosting_calendar.subscriber_count",
                                "calendar.membership_count"),
        "event_count": dig(entry, "calendar.event_count", "hosting_calendar.event_count"),
        # hosts
        "hosts": dig(entry, "hosts", "event.hosts", "calendar.hosts", default=[]) or [],
    }


def build_url(fields):
    if isinstance(fields["url"], str) and fields["url"].startswith("http"):
        return fields["url"]
    slug = fields["slug"]
    if isinstance(slug, str) and slug:
        return f"https://lu.ma/{slug}"
    return ""


def phase2():
    if not RAW_PATH.exists():
        print(f"Falta {RAW_PATH}. Corré phase1 primero.", file=sys.stderr)
        sys.exit(1)

    raw = json.loads(RAW_PATH.read_text(encoding="utf-8"))
    entries = raw.get("entries", []) if isinstance(raw, dict) else raw

    events = []
    communities = {}
    organizers = {}
    seen_api_ids = set()
    dropped = {"no_api_id": 0, "duplicate": 0, "online": 0, "past": 0, "not_sf": 0, "no_coords": 0}

    for entry in entries:
        f = extract_event_fields(entry)

        api_id = f["api_id"]
        if not api_id:
            dropped["no_api_id"] += 1
            continue
        if api_id in seen_api_ids:
            dropped["duplicate"] += 1
            continue

        loc_type = f["location_type"]
        is_online = f["is_online"] is True or (
            isinstance(loc_type, str) and loc_type.lower() in ("virtual", "online")
        )
        if is_online:
            dropped["online"] += 1
            continue
        if not is_future(f["start_at"]):
            dropped["past"] += 1
            continue

        city = f["city"]
        city_is_sf = isinstance(city, str) and "san francisco" in city.lower()
        if not city_is_sf and not in_sf_bbox(f["latitude"], f["longitude"]):
            dropped["not_sf"] += 1
            continue

        # SFEvent exige lat/lng numéricos: sin coords no se puede ubicar. No se
        # inventan (0,0) — se descarta.
        if f["latitude"] is None or f["longitude"] is None:
            dropped["no_coords"] += 1
            continue

        seen_api_ids.add(api_id)
        event_id = f"evt-{api_id}"

        # ---- Organizers (hosts) ----
        host_org_ids = []
        for host in f["hosts"]:
            host_name = dig(host, "name")
            if not host_name:
                continue
            org_id = f"org-{slugify(host_name)}"
            host_org_ids.append(org_id)
            if org_id not in organizers:
                organizers[org_id] = {
                    "id": org_id,
                    "displayName": host_name,
                    "publicRole": f"Host, {f['calendar_name']}" if f["calendar_name"] else "Host",
                    "publicContactUrl": dig(host, "website"),  # NADA de redes ni avatares
                    "organizesEventIds": [],
                    "communityIds": [],
                    "evidenceIds": [],
                }
            if event_id not in organizers[org_id]["organizesEventIds"]:
                organizers[org_id]["organizesEventIds"].append(event_id)

        # ---- Community (calendar) ----
        community_ids = []
        cal_id = f["calendar_api_id"]
        if cal_id:
            com_id = f"com-{cal_id}"
            community_ids.append(com_id)
            if com_id not in communities:
                cal_slug = f["calendar_slug"]
                communities[com_id] = {
                    "id": com_id,
                    "name": f["calendar_name"],
                    "url": f"https://lu.ma/{cal_slug}" if isinstance(cal_slug, str) and cal_slug else "",
                    "kind": "meetup-series",
                    "cadence": None,
                    "eventsRun12mo": f["event_count"],
                    "foundedYear": None,
                    "sizeEstimate": f["subscriber_count"],
                    "sizeBasis": "observed",
                    "stack": [],
                    "organizerIds": [],
                    "pastSponsors": [],
                    "evidenceIds": [],
                }
            for org_id in host_org_ids:
                if org_id not in communities[com_id]["organizerIds"]:
                    communities[com_id]["organizerIds"].append(org_id)
                if com_id not in organizers[org_id]["communityIds"]:
                    organizers[org_id]["communityIds"].append(com_id)

        expected_attendance = f["capacity"] if f["capacity"] is not None else f["guest_count"]

        events.append({
            "id": event_id,
            "name": f["name"],
            "url": build_url(f),
            "startsAt": f["start_at"],
            "venueArea": neighborhood_of(f["latitude"], f["longitude"]),
            "lat": f["latitude"],
            "lng": f["longitude"],
            "expectedAttendance": expected_attendance,
            # observed solo si Luma dio un número real; si no, estimated.
            "attendanceBasis": "observed" if expected_attendance is not None else "estimated",
            "stack": f["categories"],
            "communityIds": community_ids,
            "organizerIds": host_org_ids,
            "sponsorTiers": [],
            "knownSponsors": [],
            "pastThemes": [],
            "evidenceIds": [],
        })

    SEED_DIR.mkdir(parents=True, exist_ok=True)
    _write_json(SEED_DIR / "sf-events.json", events)
    _write_json(SEED_DIR / "sf-communities.json", list(communities.values()))
    _write_json(SEED_DIR / "sf-organizers.json", list(organizers.values()))

    print(f"Escritos en {SEED_DIR}:")
    print(f"  sf-events.json       {len(events)}")
    print(f"  sf-communities.json  {len(communities)}")
    print(f"  sf-organizers.json   {len(organizers)}")
    print(f"Descartados: {dropped}")


def _write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# --------------------------------------------------------------------------- #
def main():
    parser = argparse.ArgumentParser(description="Scraper de eventos de Luma (SF).")
    parser.add_argument("phase", choices=["phase1", "phase2"], help="fase a correr")
    args = parser.parse_args()
    if args.phase == "phase1":
        phase1()
    else:
        phase2()


if __name__ == "__main__":
    main()
