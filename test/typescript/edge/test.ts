// Copyright (c) HashiCorp, Inc
// SPDX-License-Identifier: MPL-2.0
import { QueryableStack, TestDriver, onlyJson } from "../../test-helper";
import * as path from "path";
import * as fs from "fs-extra";

describe("edge provider test", () => {
  let driver: TestDriver;

  beforeAll(async () => {
    driver = new TestDriver(__dirname);
    await driver.setupTypescriptProject();

    // use generated custom bindings
    fs.copySync(
      path.resolve(
        __dirname,
        "..",
        "..",
        "edge-provider-bindings",
        "providers",
        "edge",
      ),
      path.resolve(driver.workingDirectory, ".gen", "providers", "edge"),
    );

    console.log(driver.workingDirectory);
    await driver.synth("fixed");
  });

  describe("ReferenceStack", () => {
    let stack: QueryableStack;
    beforeAll(() => {
      stack = driver.synthesizedStack("reference");
    });

    onlyJson("renders plain values in lists", () => {
      const l = stack.byId("list");

      // Normal list
      expect(l.req[0].reqbool).toBe(true);
      expect(l.req[1].reqbool).toBe(false);
      expect(l.req[0].reqnum).toBe(1);
      expect(l.req[1].reqnum).toBe(0);
      expect(l.req[0].reqstr).toBe("reqstr");
      expect(l.req[1].reqstr).toBe("reqstr2");

      // Single item list
      expect(l.singlereq.reqbool).toBe(false);
      expect(l.singlereq.reqnum).toBe(1);
      expect(l.singlereq.reqstr).toBe("reqstr");
    });

    onlyJson("renders plain values in sets", () => {
      const s = stack.byId("set_block");

      expect(s.set).toEqual([
        { reqbool: true, reqnum: 1, reqstr: "reqstr" },
        { reqbool: false, reqnum: 0, reqstr: "reqstr2" },
      ]);
    });

    onlyJson("references plain values", () => {
      expect(stack.byId("plain").str).toEqual(
        "${optional_attribute_resource.test.str}",
      );
      expect(stack.byId("plain").num).toEqual(
        "${optional_attribute_resource.test.num}",
      );
      expect(stack.byId("plain").bool).toEqual(
        "${optional_attribute_resource.test.bool}",
      );
      expect(stack.byId("plain").strList).toEqual(
        "${optional_attribute_resource.test.strList}",
      );
      expect(stack.byId("plain").numList).toEqual(
        "${optional_attribute_resource.test.numList}",
      );
      expect(stack.byId("plain").boolList).toEqual(
        "${optional_attribute_resource.test.boolList}",
      );
    });

    onlyJson(
      "item references a required single item lists required values",
      () => {
        const item = stack.byId("from_single_list");

        expect(item.bool).toEqual(
          "${list_block_resource.list.singlereq[0].reqbool}",
        );
        expect(item.str).toEqual(
          "${list_block_resource.list.singlereq[0].reqstr}",
        );
        expect(item.num).toEqual(
          "${list_block_resource.list.singlereq[0].reqnum}",
        );
        expect(item.boolList).toEqual([
          "${list_block_resource.list.singlereq[0].reqbool}",
        ]);
        expect(item.strList).toEqual([
          "${list_block_resource.list.singlereq[0].reqstr}",
        ]);
        expect(item.numList).toEqual([
          "${list_block_resource.list.singlereq[0].reqnum}",
        ]);
      },
    );

    onlyJson("item references required values from multi-item lists", () => {
      const item = stack.byId("from_list");

      expect(item.bool).toEqual(
        "${element(list_block_resource.list.req, 0).reqbool}",
      );
      expect(item.str).toEqual("${list_block_resource.list.req[0].reqstr}");
      expect(item.num).toEqual(
        "${element(list_block_resource.list.req, 0).reqnum}",
      );
      expect(item.boolList).toEqual([
        "${element(list_block_resource.list.req, 0).reqbool}",
      ]);
      expect(item.strList).toEqual([
        "${list_block_resource.list.req[0].reqstr}",
      ]);
      expect(item.numList).toEqual([
        "${element(list_block_resource.list.req, 0).reqnum}",
      ]);
    });

    onlyJson("item references a required single item list", () => {
      const item = stack.byId("list_reference");

      // Expands single item references
      expect(item.singlereq).toMatchInlineSnapshot(`
        {
          "computedbool": "\${list_block_resource.list.singlereq[0].computedbool}",
          "computednum": "\${list_block_resource.list.singlereq[0].computednum}",
          "computedstr": "\${list_block_resource.list.singlereq[0].computedstr}",
          "optbool": "\${list_block_resource.list.singlereq[0].optbool}",
          "optnum": "\${list_block_resource.list.singlereq[0].optnum}",
          "optstr": "\${list_block_resource.list.singlereq[0].optstr}",
          "reqbool": "\${list_block_resource.list.singlereq[0].reqbool}",
          "reqnum": "\${list_block_resource.list.singlereq[0].reqnum}",
          "reqstr": "\${list_block_resource.list.singlereq[0].reqstr}",
        }
      `);
    });

    onlyJson("item references a required multi item list", () => {
      const item = stack.byId("list_reference");

      // Expands single item references
      expect(item.req).toEqual("${list_block_resource.list.req}");
    });

    onlyJson("list attribute uses reference of single-item list", () => {
      const item = stack.byId("list_literal");

      // Expands single item references
      expect(item.req[0]).toEqual("${list_block_resource.list.singlereq[0]}");
    });

    onlyJson("item references a map", () => {
      const item = stack.byId("from_map");

      // Expands map references
      expect(item.bool).toEqual("${map_resource.map.reqMap.key1}");
      expect(item.str).toEqual(
        '${lookup(map_resource.map.optMap, "key1", "missing")}',
      );
      expect(item.num).toEqual("${map_resource.map.computedMap.key1}");
      expect(item.boolList).toEqual(["${map_resource.map.reqMap.key1}"]);
      expect(item.strList).toEqual([
        '${lookup(map_resource.map.optMap, "key1", "missing")}',
      ]);
      expect(item.numList).toEqual(["${map_resource.map.computedMap.key1}"]);
    });

    onlyJson("item references a full map", () => {
      const item = stack.byId("map_reference");

      // Expands map references
      expect(item.reqMap).toEqual("${map_resource.map.reqMap}");
      expect(item.optMap).toEqual("${map_resource.map.optMap}");
    });

    onlyJson("item references set from multi-item list", () => {
      const item = stack.byId("set_from_list");

      expect(item.set).toEqual("${list_block_resource.list.req}");
    });

    onlyJson("item references multi-item list from set", () => {
      const item = stack.byId("list_from_set");

      expect(item.req).toEqual("${tolist(set_block_resource.set_block.set)}");
    });

    onlyJson("output references to complex list type (no block)", () => {
      const output = stack.output("list_from_list_type_ref");

      expect(output).toEqual(
        "${list_block_resource.list.computedListOfObject}",
      );
    });

    onlyJson(
      "item references string attribute of element of complex list type (no block)",
      () => {
        const item = stack.byId("list_item_from_list_type_ref");

        expect(item.str).toEqual(
          "${list_block_resource.list.computedListOfObject[5].str}",
        );
      },
    );

    onlyJson("allows passing null as an attribute", () => {
      const item = stack.byId("null");

      expect(item.bool).toEqual(null);
    });
  });

  describe("IteratorStack", () => {
    let stack: QueryableStack;
    beforeAll(() => {
      stack = driver.synthesizedStack("iterator");
    });

    describe("string list", () => {
      let t: Record<string, any>;
      beforeAll(() => {
        t = stack.byId("string_list_target");
      });

      onlyJson("renders for_each property", () => {
        expect(t.for_each).toBe(
          "${toset(optional_attribute_resource.target.strList)}",
        );
      });

      onlyJson("renders each.value for str attribute", () => {
        expect(t.str).toBe("${each.value}");
      });
    });
    describe("complex list", () => {
      let t: Record<string, any>;
      beforeAll(() => {
        t = stack.byId("complex_list_target");
      });

      onlyJson("renders for_each property", () => {
        expect(t.for_each).toBe("${toset(list_block_resource.list.req)}");
      });
      onlyJson("renders each.value for str attribute", () => {
        expect(t.str).toBe("${each.value.reqstr}");
      });
      onlyJson("renders each.value for num attribute", () => {
        expect(t.num).toBe("${each.value.reqnum}");
      });
    });
    describe("string map", () => {
      let t: Record<string, any>;
      beforeAll(() => {
        t = stack.byId("string_map_target");
      });

      onlyJson("renders for_each property", () => {
        expect(t.for_each).toBe("${map_resource.map.optMap}");
      });
      onlyJson("renders each.value for str attribute", () => {
        expect(t.str).toBe("${each.value}");
      });
    });
    describe("list attribute", () => {
      let t: Record<string, any>;
      beforeAll(() => {
        t = stack.byId("list_attribute");
      });

      onlyJson("renders a dynamic block", () => {
        expect(t).toHaveProperty("dynamic", {
          req: {
            content: {
              reqbool: "${each.value.reqbool}",
              reqnum: "${each.value.reqnum}",
              reqstr: "${each.value.reqstr}",
            },
            for_each: "${toset(list_block_resource.list.req)}",
            iterator: "each",
          },
        });
      });
    });
  });
});
