interface StructuredDataProps {
  data: Record<string, any>;
  id?: string;
}

export default function StructuredData({ data, id = 'structured-data' }: StructuredDataProps) {
  return (
    <script
      type="application/ld+json"
      id={id}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

