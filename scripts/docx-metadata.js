const FIXED_TIMESTAMP = "2000-01-01T00:00:00.000Z";

function normalizeCoreProperties(xml) {
  return xml.replace(
    /<dcterms:(created|modified)([^>]*)>[^<]*<\/dcterms:\1>/g,
    (_match, element, attributes) => (
      `<dcterms:${element}${attributes}>${FIXED_TIMESTAMP}</dcterms:${element}>`
    ),
  );
}

module.exports = { normalizeCoreProperties };
