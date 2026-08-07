const fs = require("node:fs");

function writeV2Png(inputPngPath, outputPngPath, characterJson) {
  const pngData = fs.readFileSync(inputPngPath);

  // Find the IEND chunk
  let iendOffset = -1;
  for (let i = 0; i <= pngData.length - 8; i++) {
    if (pngData[i] === 0x49 && pngData[i + 1] === 0x45 && pngData[i + 2] === 0x4e && pngData[i + 3] === 0x44) {
      iendOffset = i - 4; // IEND chunk length is 4 bytes before
      break;
    }
  }

  if (iendOffset === -1) {
    throw new Error("Invalid PNG");
  }

  // Format the character JSON according to V2 spec
  const v2Data = {
    spec: "chara_card_v2",
    // biome-ignore lint/style/useNamingConvention: External spec requires snake_case
    spec_version: "2.0",
    data: characterJson,
  };

  const jsonString = JSON.stringify(v2Data);
  const base64Data = Buffer.from(jsonString, "utf-8").toString("base64");

  // Create tEXt chunk: "chara\0" + base64Data
  const keyword = "chara";
  const textChunkData = Buffer.concat([Buffer.from(keyword, "latin1"), Buffer.from([0]), Buffer.from(base64Data, "latin1")]);

  const chunkLength = Buffer.alloc(4);
  chunkLength.writeUInt32BE(textChunkData.length, 0);

  const chunkType = Buffer.from("tEXt", "latin1");

  // CRC32 of chunkType + textChunkData
  const crc = crc32(Buffer.concat([chunkType, textChunkData]));
  const chunkCrc = Buffer.alloc(4);
  chunkCrc.writeUInt32BE(crc, 0);

  const textChunk = Buffer.concat([chunkLength, chunkType, textChunkData, chunkCrc]);

  // Insert the tEXt chunk right before IEND
  const newPngData = Buffer.concat([pngData.subarray(0, iendOffset), textChunk, pngData.subarray(iendOffset)]);

  fs.writeFileSync(outputPngPath, newPngData);
}

// Simple CRC32 implementation
function crc32(buf) {
  // biome-ignore lint/suspicious/noBitwiseOperators: CRC32 relies on bitwise ops
  let crc = 0 ^ -1;
  for (const byte of buf) {
    // biome-ignore lint/suspicious/noBitwiseOperators: CRC32 relies on bitwise ops
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      // biome-ignore lint/suspicious/noBitwiseOperators: CRC32 relies on bitwise ops
      crc = (crc >>> 1) ^ (crc & 1 ? 0xed_b8_83_20 : 0);
    }
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: CRC32 relies on bitwise ops
  return (crc ^ -1) >>> 0;
}

module.exports = { writeV2Png };
