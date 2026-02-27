/** JSON-LD structured data - accepts any JSON-serializable object. */
interface StructuredDataProps {
  data: Record<string, unknown>;
  id?: string;
}

export default function StructuredData({ data, id = 'structured-data' }: StructuredDataProps) {
  // Safe JSON-LD: data is server-controlled only; escape </ to prevent script injection (no user HTML).
  const jsonString = JSON.stringify(data).replace(/</g, '\\u003c');

  return (
    <script
      type="application/ld+json"
      id={id}
      /* eslint-disable-next-line react/no-danger -- JSON-LD: server-only data, escaped (no user HTML). */
      dangerouslySetInnerHTML={{ __html: jsonString }}
    />
  );
}
