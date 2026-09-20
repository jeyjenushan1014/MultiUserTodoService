/*It removes the generated directories not the source files. */

import {
  rm,
} from "node:fs/promises";

const generatedDirectories = [
  "packages/contracts/dist",
  "packages/common/dist",
  "apps/account-service/dist",
  "apps/gateway/dist",
  "coverage",
];

await Promise.all(
  generatedDirectories.map(async (directory) => {
    await rm(
      directory,
      {
        recursive: true,
        force: true,
      },
    );
  }),
);