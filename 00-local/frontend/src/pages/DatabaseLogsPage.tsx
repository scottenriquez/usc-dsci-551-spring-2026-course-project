import { useEffect, useState } from 'react';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import Select from '@cloudscape-design/components/select';
import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Flashbar, { type FlashbarProps } from '@cloudscape-design/components/flashbar';
import Table from '@cloudscape-design/components/table';
import Box from '@cloudscape-design/components/box';
import FormField from '@cloudscape-design/components/form-field';
import DateRangePicker, { type DateRangePickerProps } from '@cloudscape-design/components/date-range-picker';
import {
  listLogGroups,
  listLogStreams,
  getLogEvents,
  type LogGroup,
  type LogStream,
  type LogEvent,
} from '../api/client';

type SelectOption = { label: string; value: string };

export default function DatabaseLogsPage() {
  const [flash, setFlash] = useState<FlashbarProps.MessageDefinition[]>([]);

  const [logGroups, setLogGroups] = useState<LogGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<SelectOption | null>(null);

  const [logStreams, setLogStreams] = useState<LogStream[]>([]);
  const [selectedStream, setSelectedStream] = useState<SelectOption | null>(null);

  const [events, setEvents] = useState<LogEvent[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const [dateRange, setDateRange] = useState<DateRangePickerProps.Value | null>({
    type: 'relative',
    amount: 1,
    unit: 'hour',
    key: 'last-1-hour',
  });

  let flashIdCounter = 0;
  function addFlash(item: FlashbarProps.MessageDefinition) {
    const id = String(++flashIdCounter) + Date.now();
    setFlash((prev) => [...prev, { ...item, id, dismissible: true, onDismiss: () => setFlash((f) => f.filter((i) => i.id !== id)) }]);
  }

  function friendlyGroupName(name: string): string {
    const parts = name.split('/');
    return parts[parts.length - 1];
  }

  useEffect(() => {
    (async () => {
      setLoadingGroups(true);
      try {
        const groups = await listLogGroups();
        setLogGroups(groups);
        if (groups.length > 0) {
          setSelectedGroup({ label: friendlyGroupName(groups[0].log_group_name), value: groups[0].log_group_name });
        }
      } catch (err) {
        addFlash({ type: 'error', content: `Failed to load log groups: ${(err as Error).message}` });
      } finally {
        setLoadingGroups(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedGroup) return;
    (async () => {
      setLoadingStreams(true);
      setLogStreams([]);
      setSelectedStream(null);
      setEvents([]);
      try {
        const streams = await listLogStreams(selectedGroup.value);
        setLogStreams(streams);
        if (streams.length > 0) {
          setSelectedStream({ label: streams[0].log_stream_name, value: streams[0].log_stream_name });
        }
      } catch (err) {
        addFlash({ type: 'error', content: `Failed to load log streams: ${(err as Error).message}` });
      } finally {
        setLoadingStreams(false);
      }
    })();
  }, [selectedGroup?.value]);

  function resolveTimeRange(): { start_time?: number; end_time?: number } {
    if (!dateRange) return {};
    const now = Date.now();
    if (dateRange.type === 'relative') {
      const multipliers: Record<string, number> = {
        second: 1000,
        minute: 60_000,
        hour: 3_600_000,
        day: 86_400_000,
        week: 604_800_000,
        month: 2_592_000_000,
        year: 31_536_000_000,
      };
      const ms = dateRange.amount * (multipliers[dateRange.unit] ?? 3_600_000);
      return { start_time: now - ms, end_time: now };
    }
    return {
      start_time: new Date(dateRange.startDate).getTime(),
      end_time: new Date(dateRange.endDate).getTime(),
    };
  }

  async function loadEvents() {
    if (!selectedGroup || !selectedStream) return;
    setLoadingEvents(true);
    try {
      const range = resolveTimeRange();
      const result = await getLogEvents({
        log_group_name: selectedGroup.value,
        log_stream_name: selectedStream.value,
        ...range,
      });
      setEvents(result.events);
    } catch (err) {
      addFlash({ type: 'error', content: `Failed to load log events: ${(err as Error).message}` });
    } finally {
      setLoadingEvents(false);
    }
  }

  useEffect(() => {
    if (selectedStream) loadEvents();
  }, [selectedStream?.value]);

  const groupOptions: SelectOption[] = logGroups.map((g) => ({
    label: friendlyGroupName(g.log_group_name),
    value: g.log_group_name,
  }));

  const streamOptions: SelectOption[] = logStreams.map((s) => ({
    label: s.log_stream_name,
    value: s.log_stream_name,
  }));

  return (
    <ContentLayout header={<Header variant="h1">Database Logs</Header>}>
      <SpaceBetween size="l">
        <Flashbar items={flash} />
        <Container header={<Header variant="h2">Log source</Header>}>
          <SpaceBetween size="m">
            <FormField label="Log group">
              <Select
                selectedOption={selectedGroup}
                onChange={({ detail }) => setSelectedGroup(detail.selectedOption as SelectOption)}
                options={groupOptions}
                loadingText="Loading log groups..."
                statusType={loadingGroups ? 'loading' : 'finished'}
                placeholder="Select a log group"
              />
            </FormField>
            <FormField label="Log stream">
              <Select
                selectedOption={selectedStream}
                onChange={({ detail }) => setSelectedStream(detail.selectedOption as SelectOption)}
                options={streamOptions}
                loadingText="Loading log streams..."
                statusType={loadingStreams ? 'loading' : 'finished'}
                disabled={!selectedGroup}
                placeholder="Select a log stream"
              />
            </FormField>
            <FormField label="Time range">
              <DateRangePicker
                value={dateRange}
                onChange={({ detail }) => setDateRange(detail.value)}
                relativeOptions={[
                  { key: 'last-5-min', amount: 5, unit: 'minute', type: 'relative' },
                  { key: 'last-15-min', amount: 15, unit: 'minute', type: 'relative' },
                  { key: 'last-1-hour', amount: 1, unit: 'hour', type: 'relative' },
                  { key: 'last-6-hours', amount: 6, unit: 'hour', type: 'relative' },
                  { key: 'last-1-day', amount: 1, unit: 'day', type: 'relative' },
                  { key: 'last-7-days', amount: 7, unit: 'day', type: 'relative' },
                ]}
                isValidRange={() => ({ valid: true })}
                i18nStrings={{
                  todayAriaLabel: 'Today',
                  nextMonthAriaLabel: 'Next month',
                  previousMonthAriaLabel: 'Previous month',
                  customRelativeRangeDurationLabel: 'Duration',
                  customRelativeRangeDurationPlaceholder: 'Enter duration',
                  customRelativeRangeOptionLabel: 'Custom range',
                  customRelativeRangeOptionDescription: 'Set a custom range in the past',
                  customRelativeRangeUnitLabel: 'Unit of time',
                  formatRelativeRange: (range) => `Last ${range.amount} ${range.unit}(s)`,
                  formatUnit: (unit, value) => (value === 1 ? unit : `${unit}s`),
                  dateTimeConstraintText: 'Range must be between 6 and 30 days. Use 24 hour format.',
                  relativeModeTitle: 'Relative range',
                  absoluteModeTitle: 'Absolute range',
                  relativeRangeSelectionHeading: 'Choose a range',
                  startDateLabel: 'Start date',
                  startTimeLabel: 'Start time',
                  endDateLabel: 'End date',
                  endTimeLabel: 'End time',
                  clearButtonLabel: 'Clear',
                  cancelButtonLabel: 'Cancel',
                  applyButtonLabel: 'Apply',
                }}
                placeholder="Select a time range"
              />
            </FormField>
            <Button variant="primary" onClick={loadEvents} loading={loadingEvents} disabled={!selectedStream}>
              Fetch logs
            </Button>
          </SpaceBetween>
        </Container>
        <Table
          header={
            <Header
              variant="h2"
              actions={
                <Button iconName="refresh" onClick={loadEvents} disabled={!selectedStream} loading={loadingEvents} />
              }
              counter={`(${events.length})`}
            >
              Log events
            </Header>
          }
          columnDefinitions={[
            {
              id: 'timestamp',
              header: 'Timestamp',
              cell: (item) => new Date(item.timestamp).toISOString(),
              width: 240,
            },
            {
              id: 'message',
              header: 'Message',
              cell: (item) => (
                <Box variant="code" fontSize="body-s">
                  <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{item.message}</span>
                </Box>
              ),
            },
          ]}
          items={events}
          loading={loadingGroups || loadingStreams || loadingEvents}
          loadingText={loadingGroups ? 'Loading log groups...' : loadingStreams ? 'Loading log streams...' : 'Loading log events...'}
          trackBy="timestamp"
          empty={
            <Box textAlign="center" color="inherit">
              <SpaceBetween size="xs">
                <Box variant="p" fontWeight="bold">No log events</Box>
                <Box variant="p" color="text-body-secondary">
                  {!selectedGroup ? 'Select a log group to get started.' : !selectedStream ? 'Select a log stream.' : 'No events found for the selected time range.'}
                </Box>
              </SpaceBetween>
            </Box>
          }
          wrapLines
        />
      </SpaceBetween>
    </ContentLayout>
  );
}
