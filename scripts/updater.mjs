import fetch from "node-fetch";
import { getOctokit, context } from "@actions/github";
import { resolveUpdateLog } from "./updatelog.mjs";

const UPDATE_TAG_NAME = "updater";
const UPDATE_JSON_FILE = "update.json";
const UPDATE_JSON_PROXY = "update-proxy.json";

/// generate update.json
/// upload to update tag's release asset
async function resolveUpdater() {
  if (process.env.GITHUB_TOKEN === undefined) {
    throw new Error("GITHUB_TOKEN is required");
  }

  const options = { owner: context.repo.owner, repo: context.repo.repo };
  const github = getOctokit(process.env.GITHUB_TOKEN);

  const { data: tags } = await github.rest.repos.listTags({
    ...options,
    per_page: 10,
    page: 1,
  });

  // get the latest publish tag
  const tag = tags.find((t) => t.name.startsWith("v"));

  console.log(tag);
  console.log();

  const { data: latestRelease } = await github.rest.repos.getReleaseByTag({
    ...options,
    tag: tag.name,
  });

  const updateData = {
    name: tag.name,
    current_version: tag.name.replace("v", ""),
    tag_name: tag.name,
    notes: await resolveUpdateLog(tag.name), // use updatelog.md
    body: await resolveUpdateLog(tag.name), // 添加body字段（v1可能使用此字段）
    pub_date: new Date().toISOString(),
    platforms: {
      win64: { signature: "", url: "" }, // compatible with older formats
      linux: { signature: "", url: "" }, // compatible with older formats
      darwin: { signature: "", url: "" }, // compatible with older formats
      "darwin-aarch64": { signature: "", url: "" },
      "darwin-intel": { signature: "", url: "" },
      "darwin-x86_64": { signature: "", url: "" },
      "linux-x86_64": { signature: "", url: "" },
      "linux-x86": { signature: "", url: "" },
      "linux-i686": { signature: "", url: "" },
      "linux-aarch64": { signature: "", url: "" },
      "linux-armv7": { signature: "", url: "" },
      "windows-x86_64": { signature: "", url: "" },
      "windows-aarch64": { signature: "", url: "" },
      "windows-x86": { signature: "", url: "" },
      "windows-i686": { signature: "", url: "" },
    },
  };

  const promises = latestRelease.assets.map(async (asset) => {
    const { name, browser_download_url } = asset;

    // win64 url
    if (name.endsWith("x64-setup.nsis.zip")) {
      updateData.platforms.win64.url = browser_download_url;
      updateData.platforms["windows-x86_64"].url = browser_download_url;
    }
    // win64 signature
    if (name.endsWith("x64-setup.nsis.zip.sig")) {
      const sig = await getSignature(browser_download_url);
      updateData.platforms.win64.signature = sig;
      updateData.platforms["windows-x86_64"].signature = sig;
    }

    // win32 url
    if (name.endsWith("x86-setup.nsis.zip")) {
      updateData.platforms["windows-x86"].url = browser_download_url;
      updateData.platforms["windows-i686"].url = browser_download_url;
    }
    // win32 signature
    if (name.endsWith("x86-setup.nsis.zip.sig")) {
      const sig = await getSignature(browser_download_url);
      updateData.platforms["windows-x86"].signature = sig;
      updateData.platforms["windows-i686"].signature = sig;
    }

    // win arm url
    if (name.endsWith("arm64-setup.nsis.zip")) {
      updateData.platforms["windows-aarch64"].url = browser_download_url;
    }
    // win arm signature
    if (name.endsWith("arm64-setup.nsis.zip.sig")) {
      const sig = await getSignature(browser_download_url);
      updateData.platforms["windows-aarch64"].signature = sig;
    }

    // darwin url (intel)
    if (name.endsWith(".app.tar.gz") && !name.includes("aarch")) {
      updateData.platforms.darwin.url = browser_download_url;
      updateData.platforms["darwin-intel"].url = browser_download_url;
      updateData.platforms["darwin-x86_64"].url = browser_download_url;
    }
    // darwin signature (intel)
    if (name.endsWith(".app.tar.gz.sig") && !name.includes("aarch")) {
      const sig = await getSignature(browser_download_url);
      updateData.platforms.darwin.signature = sig;
      updateData.platforms["darwin-intel"].signature = sig;
      updateData.platforms["darwin-x86_64"].signature = sig;
    }

    // darwin url (aarch)
    if (name.endsWith("aarch64.app.tar.gz")) {
      updateData.platforms["darwin-aarch64"].url = browser_download_url;
      // 使linux可以检查更新
      updateData.platforms.linux.url = browser_download_url;
      updateData.platforms["linux-x86_64"].url = browser_download_url;
      updateData.platforms["linux-x86"].url = browser_download_url;
      updateData.platforms["linux-i686"].url = browser_download_url;
      updateData.platforms["linux-aarch64"].url = browser_download_url;
      updateData.platforms["linux-armv7"].url = browser_download_url;
    }
    // darwin signature (aarch)
    if (name.endsWith("aarch64.app.tar.gz.sig")) {
      const sig = await getSignature(browser_download_url);
      updateData.platforms["darwin-aarch64"].signature = sig;
      updateData.platforms.linux.signature = sig;
      updateData.platforms["linux-x86_64"].signature = sig;
      updateData.platforms["linux-x86"].url = browser_download_url;
      updateData.platforms["linux-i686"].url = browser_download_url;
      updateData.platforms["linux-aarch64"].signature = sig;
      updateData.platforms["linux-armv7"].signature = sig;
    }
  });

  // 在处理完所有assets后，确保旧格式平台数据与新格式一致
  await Promise.allSettled(promises);

  // 明确同步新旧格式数据
  // Windows
  if (updateData.platforms["windows-x86_64"].url) {
    updateData.platforms.win64.url = updateData.platforms["windows-x86_64"].url;
    updateData.platforms.win64.signature =
      updateData.platforms["windows-x86_64"].signature;
  }

  // Linux
  if (updateData.platforms["linux-x86_64"].url) {
    updateData.platforms.linux.url = updateData.platforms["linux-x86_64"].url;
    updateData.platforms.linux.signature =
      updateData.platforms["linux-x86_64"].signature;
  }

  // macOS
  if (updateData.platforms["darwin-x86_64"].url) {
    updateData.platforms.darwin.url = updateData.platforms["darwin-x86_64"].url;
    updateData.platforms.darwin.signature =
      updateData.platforms["darwin-x86_64"].signature;
  } else if (updateData.platforms["darwin-aarch64"].url) {
    updateData.platforms.darwin.url =
      updateData.platforms["darwin-aarch64"].url;
    updateData.platforms.darwin.signature =
      updateData.platforms["darwin-aarch64"].signature;
  }

  // 兼容v1格式，确保signature字段是字符串而不是对象
  const v1Platforms = ["win64", "linux", "darwin"]; // v1 格式的平台标识符
  v1Platforms.forEach((platform) => {
    if (
      updateData.platforms[platform] &&
      updateData.platforms[platform].signature &&
      typeof updateData.platforms[platform].signature !== "string"
    ) {
      updateData.platforms[platform].signature = String(
        updateData.platforms[platform].signature,
      );
    }
  });

  console.log(updateData);

  // maybe should test the signature as well
  // delete the null field for new format platforms only, keep v1 format platforms
  Object.entries(updateData.platforms).forEach(([key, value]) => {
    if (!value.url && !v1Platforms.includes(key)) {
      console.log(`[Error]: failed to parse release for "${key}"`);
      delete updateData.platforms[key];
    }
  });

  // 生成一个代理github的更新文件
  // 使用 https://hub.fastgit.xyz/ 做github资源的加速
  const updateDataNew = JSON.parse(JSON.stringify(updateData));

  // 确保所有关键字段都存在，但排除version字段（避免重复）
  ["current_version", "tag_name", "body"].forEach((field) => {
    if (updateData[field] && !updateDataNew[field]) {
      updateDataNew[field] = updateData[field];
    }
  });

  Object.entries(updateDataNew.platforms).forEach(([key, value]) => {
    if (value.url) {
      updateDataNew.platforms[key].url =
        "https://download.clashverge.dev/" + value.url;
    } else {
      // 只有当该平台不在v1平台列表中时才打印错误
      // v1平台即使没有URL也要保留
      if (!v1Platforms.includes(key)) {
        console.log(`[Error]: updateDataNew.platforms.${key} is null`);
      }
    }
  });

  // 确保代理更新文件中旧格式数据也正确同步
  // Windows
  if (updateDataNew.platforms["windows-x86_64"].url) {
    updateDataNew.platforms.win64.url =
      updateDataNew.platforms["windows-x86_64"].url;
    updateDataNew.platforms.win64.signature =
      updateDataNew.platforms["windows-x86_64"].signature;
  }

  // Linux
  if (updateDataNew.platforms["linux-x86_64"].url) {
    updateDataNew.platforms.linux.url =
      updateDataNew.platforms["linux-x86_64"].url;
    updateDataNew.platforms.linux.signature =
      updateDataNew.platforms["linux-x86_64"].signature;
  }

  // macOS
  if (updateDataNew.platforms["darwin-x86_64"].url) {
    updateDataNew.platforms.darwin.url =
      updateDataNew.platforms["darwin-x86_64"].url;
    updateDataNew.platforms.darwin.signature =
      updateDataNew.platforms["darwin-x86_64"].signature;
  } else if (updateDataNew.platforms["darwin-aarch64"].url) {
    updateDataNew.platforms.darwin.url =
      updateDataNew.platforms["darwin-aarch64"].url;
    updateDataNew.platforms.darwin.signature =
      updateDataNew.platforms["darwin-aarch64"].signature;
  }

  // 同样为代理文件兼容v1格式，确保signature字段是字符串而不是对象
  v1Platforms.forEach((platform) => {
    if (
      updateDataNew.platforms[platform] &&
      updateDataNew.platforms[platform].signature &&
      typeof updateDataNew.platforms[platform].signature !== "string"
    ) {
      updateDataNew.platforms[platform].signature = String(
        updateDataNew.platforms[platform].signature,
      );
    }
  });

  // update the update.json
  const { data: updateRelease } = await github.rest.repos.getReleaseByTag({
    ...options,
    tag: UPDATE_TAG_NAME,
  });

  // delete the old assets
  for (let asset of updateRelease.assets) {
    if (asset.name === UPDATE_JSON_FILE) {
      await github.rest.repos.deleteReleaseAsset({
        ...options,
        asset_id: asset.id,
      });
    }

    if (asset.name === UPDATE_JSON_PROXY) {
      await github.rest.repos
        .deleteReleaseAsset({ ...options, asset_id: asset.id })
        .catch(console.error); // do not break the pipeline
    }
  }

  // upload new assets
  await github.rest.repos.uploadReleaseAsset({
    ...options,
    release_id: updateRelease.id,
    name: UPDATE_JSON_FILE,
    data: JSON.stringify(updateData, null, 2),
  });

  await github.rest.repos.uploadReleaseAsset({
    ...options,
    release_id: updateRelease.id,
    name: UPDATE_JSON_PROXY,
    data: JSON.stringify(updateDataNew, null, 2),
  });
}

// get the signature file content
async function getSignature(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/octet-stream" },
  });

  return response.text();
}

resolveUpdater().catch(console.error);
