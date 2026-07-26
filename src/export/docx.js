function createDocxExporter({
  templates,
  templatesWithReadings,
  readings,
  musicParts,
  values,
  choiceFor,
  attributionLine,
  copyrightComplete,
  escapeXml,
}) {
  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function crc32(bytes) {
    let table = crc32.table;
    if (!table) {
      table = crc32.table = [];
      for (let value = 0; value < 256; value++) {
        let checksum = value;
        for (let bit = 0; bit < 8; bit++) {
          checksum = checksum & 1 ? 0xEDB88320 ^ (checksum >>> 1) : checksum >>> 1;
        }
        table[value] = checksum >>> 0;
      }
    }
    let checksum = 0xFFFFFFFF;
    for (const byte of bytes) checksum = table[(checksum ^ byte) & 0xFF] ^ (checksum >>> 8);
    return (checksum ^ 0xFFFFFFFF) >>> 0;
  }

  function zipStore(files) {
    const encoder = new TextEncoder();
    const uint16 = number => [number & 255, (number >> 8) & 255];
    const uint32 = number => [number & 255, (number >> 8) & 255, (number >> 16) & 255, (number >> 24) & 255];
    const chunks = [];
    const centralDirectory = [];
    let offset = 0;

    for (const file of files) {
      const name = encoder.encode(file.name);
      const checksum = crc32(file.data);
      const size = file.data.length;
      const localHeader = new Uint8Array([].concat(
        [0x50, 0x4b, 0x03, 0x04],
        uint16(20), uint16(0), uint16(0), uint16(0), uint16(0),
        uint32(checksum), uint32(size), uint32(size), uint16(name.length), uint16(0),
      ));
      chunks.push(localHeader, name, file.data);
      centralDirectory.push(
        new Uint8Array([].concat(
          [0x50, 0x4b, 0x01, 0x02],
          uint16(20), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0),
          uint32(checksum), uint32(size), uint32(size), uint16(name.length),
          uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(offset),
        )),
        name,
      );
      offset += localHeader.length + name.length + size;
    }

    const centralSize = centralDirectory.reduce((total, chunk) => total + chunk.length, 0);
    const end = new Uint8Array([].concat(
      [0x50, 0x4b, 0x05, 0x06],
      uint16(0), uint16(0), uint16(files.length), uint16(files.length),
      uint32(centralSize), uint32(offset), uint16(0),
    ));
    const chunksWithDirectory = [...chunks, ...centralDirectory, end];
    const output = new Uint8Array(chunksWithDirectory.reduce((total, chunk) => total + chunk.length, 0));
    let position = 0;
    for (const chunk of chunksWithDirectory) {
      output.set(chunk, position);
      position += chunk.length;
    }
    return output;
  }

  function readingText(citation) {
    return readings[citation] || "";
  }

  return function downloadWord(withReadings) {
    const plan = values();
    const decoder = new TextDecoder();
    const source = withReadings ? templatesWithReadings : templates;
    let documentXml = decoder.decode(base64ToBytes(source["word/document.xml"]));
    const replacements = {
      "@@DAY@@": plan.day,
      "@@META@@": plan.meta,
      "@@FIRST@@": plan.first,
      "@@PSALM@@": plan.psalm,
      "@@SECOND@@": plan.second || "—",
      "@@GOSPEL@@": plan.gospel,
    };

    musicParts.forEach(part => {
      const choice = choiceFor(part.key);
      replacements[`@@MUSIC_${part.token}@@`] = choice.song;
      const attribution = attributionLine(choice);
      const warning = choice.song && !copyrightComplete(choice)
        ? `${attribution ? " · " : ""}Copyright information incomplete`
        : "";
      replacements[`@@ATTR_${part.token}@@`] = attribution + warning;
    });

    if (withReadings) {
      Object.assign(replacements, {
        "@@FIRSTTEXT@@": readingText(plan.first) || "(full text not available — see citation above)",
        "@@PSALMTEXT@@": readingText(plan.psalm) || "(sung — see citation above)",
        "@@SECONDTEXT@@": readingText(plan.second) || "—",
        "@@GOSPELTEXT@@": readingText(plan.gospel) || "(full text not available — see citation above)",
      });
    }

    // Replace longer tokens first so @@FIRST@@ cannot clobber @@FIRSTTEXT@@.
    Object.keys(replacements).sort((a, b) => b.length - a.length).forEach(token => {
      documentXml = documentXml.split(token).join(escapeXml(replacements[token]));
    });

    const encoder = new TextEncoder();
    const files = Object.keys(source).map(name => name === "word/document.xml"
      ? { name, data: encoder.encode(documentXml) }
      : { name, data: base64ToBytes(source[name]) });
    const blob = new Blob(
      [zipStore(files)],
      { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    );
    const suffix = withReadings ? "_with_readings" : "";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `StJames_6pm_Mass_${plan.date}${suffix}.docx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  };
}
