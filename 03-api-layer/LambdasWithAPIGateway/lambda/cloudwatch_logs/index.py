import json
import os
import time
import boto3


CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
}

LOG_GROUP_PREFIX = os.environ['LOG_GROUP_PREFIX']

logs_client = boto3.client('logs')


def response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps(body, default=str),
    }


def list_log_groups():
    groups = []
    paginator = logs_client.get_paginator('describe_log_groups')
    for page in paginator.paginate(logGroupNamePrefix=LOG_GROUP_PREFIX):
        for g in page['logGroups']:
            groups.append({
                'log_group_name': g['logGroupName'],
                'stored_bytes': g.get('storedBytes', 0),
                'creation_time': g.get('creationTime'),
            })
    return groups


def list_log_streams(log_group_name):
    streams = []
    paginator = logs_client.get_paginator('describe_log_streams')
    for page in paginator.paginate(
        logGroupName=log_group_name,
        orderBy='LastEventTime',
        descending=True,
    ):
        for s in page['logStreams']:
            streams.append({
                'log_stream_name': s['logStreamName'],
                'last_event_timestamp': s.get('lastEventTimestamp'),
                'stored_bytes': s.get('storedBytes', 0),
            })
    return streams


def get_log_events(log_group_name, log_stream_name, start_time, end_time, next_token):
    kwargs = {
        'logGroupName': log_group_name,
        'logStreamName': log_stream_name,
        'startFromHead': False,
        'limit': 200,
    }
    if start_time:
        kwargs['startTime'] = int(start_time)
    if end_time:
        kwargs['endTime'] = int(end_time)
    if next_token:
        kwargs['nextToken'] = next_token

    resp = logs_client.get_log_events(**kwargs)
    events = [
        {
            'timestamp': e['timestamp'],
            'message': e['message'],
            'ingestion_time': e.get('ingestionTime'),
        }
        for e in resp['events']
    ]
    return {
        'events': events,
        'next_forward_token': resp.get('nextForwardToken'),
        'next_backward_token': resp.get('nextBackwardToken'),
    }


def handler(event, context):
    http_method = event.get('httpMethod', '')
    if http_method == 'OPTIONS':
        return response(200, {})

    resource = event.get('resource', '')
    params = event.get('queryStringParameters') or {}

    # GET /logs/groups
    if resource == '/logs/groups':
        return response(200, list_log_groups())

    # GET /logs/streams?log_group_name=...
    if resource == '/logs/streams':
        log_group_name = params.get('log_group_name')
        if not log_group_name:
            return response(400, {'error': 'Missing required query parameter: log_group_name'})
        return response(200, list_log_streams(log_group_name))

    # GET /logs/events?log_group_name=...&log_stream_name=...&start_time=...&end_time=...&next_token=...
    if resource == '/logs/events':
        log_group_name = params.get('log_group_name')
        log_stream_name = params.get('log_stream_name')
        if not log_group_name or not log_stream_name:
            return response(400, {'error': 'Missing required query parameters: log_group_name, log_stream_name'})
        start_time = params.get('start_time')
        end_time = params.get('end_time')
        next_token = params.get('next_token')
        return response(200, get_log_events(log_group_name, log_stream_name, start_time, end_time, next_token))

    return response(404, {'error': f'No route for {http_method} {resource}'})
