import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import { CodeView } from '@cloudscape-design/code-view';
import { createHighlight } from '@cloudscape-design/code-view/highlight';
import { PgsqlHighlightRules } from 'ace-code/src/mode/pgsql_highlight_rules';
import schemaSql from '../assets/schema.sql?raw';

const highlightPgsql = createHighlight(new PgsqlHighlightRules());

export default function SchemaPage() {
  return (
    <ContentLayout header={<Header variant="h1">Database Schema</Header>}>
        <Container header={<Header variant="h2"><code>schema.sql</code></Header>}>
        <CodeView
          content={schemaSql.trim()}
          highlight={highlightPgsql}
          lineNumbers
        />
      </Container>
    </ContentLayout>
  );
}
