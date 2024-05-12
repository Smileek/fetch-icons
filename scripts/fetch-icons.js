import * as dotenv from "dotenv";
import * as fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const PERSONAL_ACCESS_TOKEN = String(
  process.env.VITE_FIGMA_PERSONAL_ACCESS_TOKEN
);

const FIGMA_API_URL = "https://api.figma.com/v1";
const FILE_KEY = "v50KJO82W9bBJUppE8intT";

const PATH_TO_ICONS = "../src/assets/icons";

const URL_BATCH_SIZE = 200;
const FILE_BATCH_SIZE = 10;

const GREEN_PREFIX = "\x1b[32m";
const YELLOW_PREFIX = "\x1b[33m";
const RESET_COLOR = "\x1b[0m";

const currentPath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentPath);

// https://www.figma.com/design/v50KJO82W9bBJUppE8intT/Material-Design-Icons-(Community)?node-id=2402-2207&p=f&t=MVEHj7IHfx6DOGyR-0
const iconSets = {
  toggle: "2403-4364",
  search: "2403-4568",
  action: "2403-6067",
};

// // Or, if you want one big set:
// const iconSets = {
//   index: "2402-2207",
// };

const getConfig = (contentType = "application/json") => ({
  method: "GET",
  headers: {
    "Content-Type": contentType,
    "X-Figma-Token": PERSONAL_ACCESS_TOKEN,
  },
});

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const normalizeName = (name) =>
  name
    ?.split(/[_-]/)
    .map((x) => capitalize(x))
    .join("");

const cleanupSvg = (data) => {
  const svgTags = /<\/?svg.*?>/g;
  const colorFills = /fill=["'].+?["']/g;

  return data
    .replace(svgTags, "")
    .replace(colorFills, 'fill="${color}"')
    .replace(/\n/g, "");
};

const cleanLastLogLine = () => {
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
};

const drawProgressBar = (current, total) => {
  const progress = current / total;
  const barWidth = 20;
  const filledWidth = Math.floor(progress * barWidth);
  const emptyWidth = barWidth - filledWidth;
  const progressBar = "█".repeat(filledWidth) + "-".repeat(emptyWidth);

  cleanLastLogLine();
  process.stdout.write(
    `      Progress: [${progressBar}] (${current}/${total})`
  );
};

const fetchFrameData = async (nodeId) => {
  const response = await fetch(
    `${FIGMA_API_URL}/files/${FILE_KEY}/nodes?ids=${nodeId}`,
    getConfig()
  );
  if (!response.ok) {
    throw new Error(
      `Error getting data for node ${nodeId}: ${response.status}`
    );
  }

  const data = await response.json();
  return data.nodes[nodeId].document;
};

const getImageNodes = (row) => {
  const nodes = {};

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

const fetchImageUrls = async (nodeIds) => {
  const response = await fetch(
    `${FIGMA_API_URL}/images/${FILE_KEY}?ids=${nodeIds.join(",")}&format=svg`,
    getConfig()
  );
  if (!response.ok) {
    throw new Error(`Error getting urls: ${response}`);
  }

  return await response.json();
};

const getImagesFromFrame = async (nodeId, setName = "index") => {
  console.log(`Getting ${setName} icons from the node ${nodeId}`);
  console.log("[1/5] Removing existing icons...");

  const fileName = `${setName}.ts`;

  const filePath = path.join(
    path.resolve(currentDirectory, PATH_TO_ICONS),
    fileName
  );

  if (fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) throw err;
    });
  }

  try {
    console.log("[2/5] Fetching Figma icon nodes...");

    const mainNode = await fetchFrameData(nodeId);
    const imageNodes = getImageNodes(mainNode);

    const ids = Object.keys(imageNodes);
    if (!ids.length) {
      console.error("No icons found!");
      process.exit(1);
    }

    console.log(
      `[3/5] Fetching ${YELLOW_PREFIX}${ids.length}${RESET_COLOR} icons URLs...`
    );

    const iconsData = [];

    for (let i = 0; i < ids.length; i += URL_BATCH_SIZE) {
      drawProgressBar(i, ids.length);

      const imageUrls = await fetchImageUrls(ids.slice(i, i + URL_BATCH_SIZE));

      iconsData.push(
        ...Object.entries(imageUrls.images).map(([id, url]) => ({
          url: String(url),
          name: imageNodes[id],
        }))
      );
    }

    cleanLastLogLine();

    iconsData.sort((a, b) => a.name.localeCompare(b.name));

    console.log("[4/5] Fetching icon files...");

    const fileContent = [];
    const iconArray = [];

    const getPromise = async (item) => {
      const response = await fetch(item.url, getConfig("image/svg+xml"));
      if (response.ok) {
        const data = await response.text();
        return { name: item.name, data };
      } else {
        console.error(`Error fetching ${item} icon`, response);
      }
    };

    for (let i = 0; i < iconsData.length; i += FILE_BATCH_SIZE) {
      drawProgressBar(i, iconsData.length);

      const batch = await Promise.allSettled(
        iconsData.slice(i, i + FILE_BATCH_SIZE).map(getPromise)
      );

      for (const icon of batch) {
        if (icon?.status === "fulfilled" && icon.value) {
          const iconName = `Icon${icon.value.name}`;
          const svgData = cleanupSvg(icon.value.data);
          fileContent.push(
            `export const ${iconName} = (color: string) =>\n  \`${svgData}\`;\n`
          );
          iconArray.push(iconName);
        }
      }
    }

    cleanLastLogLine();

    fileContent.push(
      `\r\nexport const ${setName.toLocaleLowerCase()}IconSet: Record<string, (color: string) => string> = {\r\n  ${iconArray.join(
        ",\r\n  "
      )}\r\n};\r\n`
    );

    console.log(
      `${YELLOW_PREFIX}${iconArray.length}${RESET_COLOR} icons fetched`
    );
    if (iconArray.length < iconsData.length) {
      console.error(
        `Failed to fetch ${
          iconsData.length - iconArray.length
        } icons. Check the logs for more details.`
      );
    }

    console.log(`[5/5] Creating ${fileName} file...`);

    fs.writeFileSync(filePath, fileContent.join(""));

    console.log(`${GREEN_PREFIX}=> ${fileName} file created!${RESET_COLOR}`);
    console.log("====================================\n");
  } catch (err) {
    console.error(err);
  }
};

for (const [setName, nodeId] of Object.entries(iconSets)) {
  await getImagesFromFrame(nodeId.replace("-", ":"), setName);
}
