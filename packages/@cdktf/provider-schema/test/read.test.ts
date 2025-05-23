/**
 * Copyright (c) HashiCorp, Inc.
 * SPDX-License-Identifier: MPL-2.0
 */

import {
  ConstructsMakerProviderTarget,
  Language,
  TerraformProviderConstraint,
  withTempDir,
} from "@cdktf/commons";
import { readSchema } from "../";
import * as fs from "fs-extra";
import * as path from "path";

describe.skip("read", () => {
  describe("disabled cache", () => {
    it("can generate a provider schema", async () => {
      const schema = await readSchema([
        new ConstructsMakerProviderTarget(
          new TerraformProviderConstraint("kreuzwerker/docker@=3.0.2"),
          Language.TYPESCRIPT,
        ),
      ]);
      expect(schema).toHaveProperty([
        "providerSchema",
        "provider_schemas",
        "registry.terraform.io/kreuzwerker/docker",
      ]);
    });
  });

  describe("enabled cache", () => {
    it("can load cached value", async () => {
      await withTempDir("cache", async () => {
        const cached = { my: "schema" };
        const cacheKey = "kreuzwerker%2Fdocker@%3D3.0.2";
        await fs.writeFile(
          path.join(process.cwd(), `${cacheKey}.json`),
          JSON.stringify(cached),
        );

        const schema = await readSchema(
          [
            new ConstructsMakerProviderTarget(
              new TerraformProviderConstraint("kreuzwerker/docker@=3.0.2"),
              Language.TYPESCRIPT,
            ),
          ],
          process.cwd(),
        );
        expect(schema).toEqual({
          moduleSchema: {},
          providerSchema: { format_version: "0.1", ...cached },
        });
      });
    });
  });
});
