import axios from "axios";
import * as dotenv from "dotenv";
import * as fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GetFileNodesResponse, HasChildrenTrait } from "@figma/rest-api-spec";

dotenv.config();

const PERSONAL_ACCESS_TOKEN = String(
  process.env.VITE_FIGMA_PERSONAL_ACCESS_TOKEN
);

const FIGMA_API_URL = "https://api.figma.com/v1";
const FILE_KEY = "v50KJO82W9bBJUppE8intT";
const MAIN_NODE_ID = "2403:4364"; //"2403:6067";

const ICONS_FOLDER = "../src/assets/icons";
const ICONS_FILE_NAME = "index.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** --- Utility functions --- */

const getConfig = (contentType = "application/json") => ({
  method: "GET",
  headers: {
    "Content-Type": contentType,
    "X-Figma-Token": PERSONAL_ACCESS_TOKEN,
  },
});

const saveFile = (filePath: string, content: string) => {
  try {
    fs.writeFileSync(path.resolve(__dirname, filePath), content);
  } catch (err) {
    console.error(err);
  }
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const normalizeName = (name: string) =>
  name
    ?.split(/[_-]/)
    .map((x) => capitalize(x))
    .join("");

const normalizeFilename = (filename: string) =>
  filename.replace(/(-| |&)/g, "").replace("20", "");

const fetchFrameData = async (nodeId: string) => {
  const { data } = await axios.get<GetFileNodesResponse>(
    `${FIGMA_API_URL}/files/${FILE_KEY}/nodes?ids=${nodeId}`,
    getConfig()
  );

  return data.nodes[nodeId].document as HasChildrenTrait;
};

const getImageNodes = (row: HasChildrenTrait) => {
  const nodes: Record<string, string> = {};

  for (const image of row.children.filter((node) => node.type === "INSTANCE")) {
    const name = normalizeName(image.name);
    const id = image.id;
    nodes[id] = name;
  }

  for (const frame of row.children.filter((node) => node.type === "FRAME")) {
    Object.assign(nodes, getImageNodes(frame));
  }

  return nodes;
};

const fetchImageUrls = async (nodeIds: string[]) => {
  const { data } = await axios.get(
    `${FIGMA_API_URL}/images/${FILE_KEY}?ids=${nodeIds.join(",")}&format=svg`,
    getConfig()
  );

  return data;
};

console.log("[0/4] Removing existing icons...");

fs.readdir(path.resolve(__dirname, ICONS_FOLDER), (err, files) => {
  if (err) throw err;

  for (const file of files)
    fs.unlink(path.join(path.resolve(__dirname, ICONS_FOLDER), file), (err) => {
      if (err) throw err;
    });
});

try {
  console.log("[1/4] Fetching Figma icon nodes...");

  const mainNode = await fetchFrameData(MAIN_NODE_ID);
  const imageNodes = getImageNodes(mainNode);

  const ids = Object.keys(imageNodes);
  if (!ids.length) {
    console.error("No icons found!");
    process.exit(1);
  }

  console.log(`[2/4] Fetching ${ids.length} icons URLs...`);

  const imageUrls = await fetchImageUrls(ids);
  const iconData = Object.entries(imageUrls.images)
    .map(([id, url]) => ({
      id,
      url: String(url),
      name: imageNodes[id],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log("[3/4] Fetching icon files...");

  const decorateIconName = (name: string) => `Icon${name}`;

  const svgTags = /<\/?svg.*?>/g;
  const colorFills = /fill=["'].+?["']/g;

  const cleanup = (data: string) => {
    return data
      .replace(svgTags, "")
      .replace(colorFills, 'fill="${color}"')
      .replace(/\n/g, "");
  };

  const contents: string[] = [];
  const promises: Promise<{ name: string; data: string }>[] = [];
  const iconArray: string[] = [];

  iconData.forEach(async (ic) => {
    promises.push(
      axios
        .get(ic.url, getConfig("image/svg+xml"))
        .then(({ data }) => {
          return { name: ic.name, data };
        })
        .catch((err) => {
          console.error(err);
          return new Promise(() => null);
        })
    );
  });

  for (let i = 0; i < promises.length; i += 10) {
    const res = await Promise.allSettled(promises.slice(i, i + 10));

    for (const ic of res) {
      if (ic?.status === "fulfilled") {
        const iconName = decorateIconName(normalizeFilename(ic.value.name));
        const iconData = cleanup(ic.value.data);
        contents.push(
          `export const ${iconName} = (color: string) =>\n  \`${iconData}\`;\n`
        );
        iconArray.push(iconName);
      }
    }

    console.log(`${i} to ${i + 10}: done`);
  }

  contents.push(
    `\r\nexport const iconSet: Record<string, (color: string) => string> = {\r\n  ${iconArray.join(
      ",\r\n  "
    )}\r\n};\r\n`
  );

  console.log(`=> ${iconArray.length} icons fetched!`);

  console.log(`[4/4] Creating ${ICONS_FILE_NAME} file...`);

  saveFile(`${ICONS_FOLDER}/${ICONS_FILE_NAME}`, contents.join(""));

  console.log(`=> ${ICONS_FILE_NAME} file created!`);
} catch (err) {
  console.error(err);
}
