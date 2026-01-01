import { expect, test } from "bun:test";
import { twitchHello } from "../src/index";

test("twitchHello", () => {
  expect(twitchHello()).toBe("twitch");
});
