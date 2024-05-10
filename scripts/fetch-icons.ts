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

const ICONS_FOLDER = "../src/assets/icons";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://www.figma.com/design/v50KJO82W9bBJUppE8intT/Material-Design-Icons-(Community)?node-id=2403-6067&t=erLbxL4F8Bxs3EBE-0
const iconSets = {
  toggle: "2403-4364",
  search: "2403-4568",
  action: "2403-6067",
};

const GREEN_PREFIX = "\x1b[32m";
const YELLOW_PREFIX = "\x1b[33m";
const RESET_COLOR = "\x1b[0m";

const getConfig = (contentType = "application/json") => ({
  method: "GET",
  headers: {
    "Content-Type": contentType,
    "X-Figma-Token": PERSONAL_ACCESS_TOKEN,
  },
});

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const normalizeName = (name: string) =>
  name
    ?.split(/[_-]/)
    .map((x) => capitalize(x))
    .join("");

const cleanupSvg = (data: string) => {
  const svgTags = /<\/?svg.*?>/g;
  const colorFills = /fill=["'].+?["']/g;

  return data
    .replace(svgTags, "")
    .replace(colorFills, 'fill="${color}"')
    .replace(/\n/g, "");
};

const drawProgressBar = (current: number, total: number) => {
  const progress = current / total;
  const barWidth = 20;
  const filledWidth = Math.floor(progress * barWidth);
  const emptyWidth = barWidth - filledWidth;
  const progressBar = "█".repeat(filledWidth) + "-".repeat(emptyWidth);

  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
  process.stdout.write(
    `      Progress: [${progressBar}] (${current}/${total})`
  );
};

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

const getImagesFromFrame = async (nodeId: string, setName = "index") => {
  console.log(`Getting ${setName} icons from the node ${nodeId}`);
  console.log("[1/5] Removing existing icons...");

  const fileName = `${setName}.ts`;

  const filePath = path.join(path.resolve(__dirname, ICONS_FOLDER), fileName);

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

    const imageUrls = await fetchImageUrls(ids);
    const iconsData = Object.entries(imageUrls.images)
      .map(([id, url]) => ({
        url: String(url),
        name: imageNodes[id],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    console.log("[4/5] Fetching icon files...");

    const fileContent: string[] = [];
    const iconArray: string[] = [];
    const BATCH_SIZE = 10;

    const getPromise = async (item: any) => {
      try {
        const { data } = await axios.get<string>(
          item.url,
          getConfig("image/svg+xml")
        );
        return { name: item.name, data };
      } catch (err) {
        console.error(err);
      }
    };

    for (let i = 0; i < iconsData.length; i += BATCH_SIZE) {
      const batch = await Promise.allSettled(
        iconsData.slice(i, i + BATCH_SIZE).map(getPromise)
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

      drawProgressBar(i, iconsData.length);
    }
    drawProgressBar(iconsData.length, iconsData.length);
    process.stdout.write("\n");

    fileContent.push(
      `\r\nexport const ${setName.toLocaleLowerCase()}IconSet: Record<string, (color: string) => string> = {\r\n  ${iconArray.join(
        ",\r\n  "
      )}\r\n};\r\n`
    );

    console.log(
      `${YELLOW_PREFIX}${iconArray.length}${RESET_COLOR} icons fetched`
    );

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
