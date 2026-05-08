import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Box from '@cloudscape-design/components/box';

export default function HomePage() {
  return (
    <ContentLayout
      header={<Header variant="h1">Authors</Header>}
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Team</Header>}>
          <Box fontSize="heading-m">
            <ul>
              <li>Scott Enriquez</li>
              <li>Tingyin Deng</li>
              <li>Wen-Yen Hsu</li>
            </ul>
          </Box>
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
