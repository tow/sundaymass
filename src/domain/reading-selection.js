// Pure policy for validating a manual reading against lectionary roles and full text.
(function (global) {
  "use strict";

  function create({
    readingSlots,
    roleCitations,
    citationRoles,
    readings,
    normalizedCitation,
    citationAlternatives,
    parseReadingCitation,
  }) {
    const slotByKey = new Map(readingSlots.map(slot => [slot.key, slot]));

    function suggestions(computed) {
      const alternatives = citationAlternatives(computed);
      if (alternatives.length === 1) {
        return [{
          citation: computed,
          label: computed,
          note: "Computed for this celebration",
          isDefault: true,
        }];
      }
      return alternatives.map((citation, index) => ({
        citation,
        label: citation,
        note: index === 0 ? "Longer form" : "Shorter or alternative form",
        isDefault: false,
      }));
    }

    function invalid(message, state = "error") {
      return { valid: false, message, state };
    }

    function validate({ slotKey, raw, computed }) {
      const slot = slotByKey.get(slotKey);
      if (!slot) return invalid("That reading slot is not available.");
      const citation = String(raw || "").trim();
      if (!citation) {
        return invalid("Choose one of the options above or enter a citation.", "");
      }

      const options = suggestions(computed);
      const defaultOption = options.find(option =>
        option.isDefault
        && normalizedCitation(option.citation) === normalizedCitation(citation),
      );
      if (defaultOption) {
        return {
          valid: true,
          message: "This restores the computed reading.",
          state: "valid",
          previewText: readings[computed] || "The text is not available in this app.",
          canonicalCitation: computed,
          requiresConfirmation: false,
          buttonLabel: "Use computed reading",
          selection: {
            slot: slot.key,
            citation: computed,
            isDefault: true,
            requiresConfirmation: false,
          },
        };
      }

      const normalized = normalizedCitation(citation);
      const canonical = roleCitations[slot.key].get(normalized);
      if (!canonical) {
        const otherRoles = citationRoles[normalized] || [];
        if (otherRoles.length) {
          const labels = otherRoles
            .map(key => slotByKey.get(key)?.label.toLowerCase())
            .filter(Boolean)
            .join(" or ");
          return invalid(
            `That passage is known as a ${labels}, not a ${slot.label.toLowerCase()}.`,
          );
        }
        return invalid(
          `That citation is not in the available ${slot.label.toLowerCase()} lectionary passages.`,
        );
      }

      const parsed = parseReadingCitation(canonical);
      const text = readings[canonical];
      if (!parsed || !text) {
        return invalid(
          "This passage is missing a valid citation or full text and cannot be selected.",
        );
      }

      const approved = options.some(option =>
        normalizedCitation(option.citation) === normalizedCitation(canonical),
      );
      const requiresConfirmation = !approved;
      return {
        valid: true,
        message: requiresConfirmation
          ? "Valid for this reading slot. Confirm the non-standard selection below."
          : "Valid option for this celebration.",
        state: "valid",
        previewText: text,
        canonicalCitation: canonical,
        requiresConfirmation,
        buttonLabel: "Use reading",
        selection: {
          slot: slot.key,
          citation: canonical,
          book: parsed.book,
          segments: parsed.segments,
          origin: approved ? "ordo-option" : "lectionary-catalog",
          translation: "World English Bible",
          textVersion: "embedded-2026-07",
          requiresConfirmation,
        },
      };
    }

    return Object.freeze({ suggestions, validate });
  }

  const api = Object.freeze({ create });
  global.ReadingSelection = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
