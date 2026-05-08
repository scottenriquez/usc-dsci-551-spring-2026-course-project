import json
import logging
import os
import re
import time
from pathlib import Path

from flask import Flask, request, Response

import crud
import local_logs

LOG_DIR = Path(os.environ.get('LOG_DIR', '/var/log/app'))
LOG_DIR.mkdir(parents=True, exist_ok=True)

api_log_path = LOG_DIR / 'api.log'
formatter = logging.Formatter(
    fmt='[%(asctime)s.%(msecs)03d UTC] %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
formatter.converter = time.gmtime

root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)
file_handler = logging.FileHandler(api_log_path)
file_handler.setFormatter(formatter)
stream_handler = logging.StreamHandler()
stream_handler.setFormatter(formatter)
root_logger.handlers = [file_handler, stream_handler]

logging.getLogger('werkzeug').setLevel(logging.WARNING)
log = logging.getLogger('api')

app = Flask(__name__)

ROUTE_TEMPLATES = [
    ('/users', re.compile(r'^/users/?$'), crud.handler),
    ('/users/{id}', re.compile(r'^/users/(?P<id>[^/]+)/?$'), crud.handler),
    ('/accounts', re.compile(r'^/accounts/?$'), crud.handler),
    ('/accounts/{id}/balance', re.compile(r'^/accounts/(?P<id>[^/]+)/balance/?$'), crud.handler),
    ('/accounts/{id}', re.compile(r'^/accounts/(?P<id>[^/]+)/?$'), crud.handler),
    ('/transactions', re.compile(r'^/transactions/?$'), crud.handler),
    ('/transactions/{id}', re.compile(r'^/transactions/(?P<id>[^/]+)/?$'), crud.handler),
    ('/logs/groups', re.compile(r'^/logs/groups/?$'), local_logs.handler),
    ('/logs/streams', re.compile(r'^/logs/streams/?$'), local_logs.handler),
    ('/logs/events', re.compile(r'^/logs/events/?$'), local_logs.handler),
]


def build_event(path: str):
    for resource, regex, handler in ROUTE_TEMPLATES:
        m = regex.match(path)
        if not m:
            continue
        return {
            'httpMethod': request.method,
            'resource': resource,
            'pathParameters': m.groupdict() or None,
            'queryStringParameters': dict(request.args) or None,
            'body': request.get_data(as_text=True) or None,
        }, handler
    return None, None


@app.route('/health')
def health():
    return Response('ok', status=200, mimetype='text/plain')


@app.route('/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
@app.route('/', methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
def proxy(path: str = ''):
    full_path = '/' + path
    event, handler = build_event(full_path)
    if not handler:
        log.warning('no route for %s %s', request.method, full_path)
        return Response(json.dumps({'error': f'No route for {request.method} {full_path}'}),
                        status=404, mimetype='application/json')

    log.info('%s %s', request.method, full_path)
    result = handler(event, None)
    return Response(
        result.get('body', ''),
        status=result.get('statusCode', 200),
        headers=result.get('headers', {}),
    )


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', '8000')))