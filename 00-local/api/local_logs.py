import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
}

LOG_DIR = Path(os.environ.get('LOG_DIR', '/var/log/app'))


def response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps(body, default=str),
    }


def _ensure_log_dir():
    LOG_DIR.mkdir(parents=True, exist_ok=True)


def _file_size(path: Path) -> int:
    try:
        return path.stat().st_size
    except OSError:
        return 0


def _file_mtime_ms(path: Path) -> int:
    try:
        return int(path.stat().st_mtime * 1000)
    except OSError:
        return 0


def _stream_path(group_name: str, stream_name: str) -> Path:
    group_path = LOG_DIR / group_name
    if group_path.is_dir():
        return group_path / f'{stream_name}.log'
    return LOG_DIR / f'{group_name}.log'


def list_log_groups():
    _ensure_log_dir()
    groups = []
    for entry in sorted(LOG_DIR.iterdir()):
        if entry.is_file() and entry.suffix == '.log':
            groups.append({
                'log_group_name': entry.stem,
                'stored_bytes': _file_size(entry),
                'creation_time': _file_mtime_ms(entry),
            })
        elif entry.is_dir():
            total = sum(_file_size(p) for p in entry.glob('*.log'))
            groups.append({
                'log_group_name': entry.name,
                'stored_bytes': total,
                'creation_time': _file_mtime_ms(entry),
            })
    return groups


def list_log_streams(group_name: str):
    group_path = LOG_DIR / group_name
    if group_path.is_dir():
        streams = []
        for entry in sorted(group_path.glob('*.log'), key=lambda p: p.stat().st_mtime, reverse=True):
            streams.append({
                'log_stream_name': entry.stem,
                'last_event_timestamp': _file_mtime_ms(entry),
                'stored_bytes': _file_size(entry),
            })
        return streams
    file_path = LOG_DIR / f'{group_name}.log'
    if not file_path.exists():
        return []
    return [{
        'log_stream_name': 'default',
        'last_event_timestamp': _file_mtime_ms(file_path),
        'stored_bytes': _file_size(file_path),
    }]


_TS_RE = re.compile(
    r'^\[?(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:\s*[A-Za-z]{2,4}|Z)?)\]?'
)


def _parse_line_timestamp(line: str, fallback_ms: int) -> int:
    m = _TS_RE.match(line)
    if not m:
        return fallback_ms
    raw = m.group(1).replace(',', '.')
    raw = re.sub(r'\s*(?:[A-Za-z]{2,4}|Z)$', '', raw).strip()
    raw = raw.replace('T', ' ')
    for fmt in ('%Y-%m-%d %H:%M:%S.%f', '%Y-%m-%d %H:%M:%S'):
        try:
            dt = datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
            return int(dt.timestamp() * 1000)
        except ValueError:
            continue
    return fallback_ms


def get_log_events(group_name, stream_name, start_time, end_time, _next_token):
    file_path = _stream_path(group_name, stream_name)
    if not file_path.exists():
        return {'events': [], 'next_forward_token': None, 'next_backward_token': None}

    fallback_ms = _file_mtime_ms(file_path)
    events = []
    with file_path.open('r', errors='replace') as f:
        for raw_line in f:
            line = raw_line.rstrip('\n')
            if not line:
                continue
            ts = _parse_line_timestamp(line, fallback_ms)
            if start_time is not None and ts < int(start_time):
                continue
            if end_time is not None and ts > int(end_time):
                continue
            events.append({'timestamp': ts, 'message': line, 'ingestion_time': fallback_ms})

    events.sort(key=lambda e: e['timestamp'], reverse=True)
    if len(events) > 500:
        events = events[:500]

    return {'events': events, 'next_forward_token': None, 'next_backward_token': None}


def handler(event, _context):
    http_method = event.get('httpMethod', '')
    if http_method == 'OPTIONS':
        return response(200, {})

    resource = event.get('resource', '')
    params = event.get('queryStringParameters') or {}

    if resource == '/logs/groups':
        return response(200, list_log_groups())

    if resource == '/logs/streams':
        group = params.get('log_group_name')
        if not group:
            return response(400, {'error': 'Missing required query parameter: log_group_name'})
        return response(200, list_log_streams(group))

    if resource == '/logs/events':
        group = params.get('log_group_name')
        stream = params.get('log_stream_name')
        if not group or not stream:
            return response(400, {'error': 'Missing required query parameters: log_group_name, log_stream_name'})
        return response(200, get_log_events(
            group, stream,
            params.get('start_time'), params.get('end_time'), params.get('next_token'),
        ))

    return response(404, {'error': f'No route for {http_method} {resource}'})