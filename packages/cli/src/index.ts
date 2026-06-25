#!/usr/bin/env node
import chalk from "chalk";
import { Command } from "commander";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { z } from "zod";

/**
 * CLI Adapter for NodalKit
 *
 * Architectural Intent:
 * This package serves as the human-facing and shell-scripting adapter.
 * It strictly acts as a translation layer: parsing command-line arguments,
 * retrieving persistent configuration from the local filesystem, and
 * delegating execution to the shared `@nodalkit/nodalkit-core`.
 *
 * By isolating terminal output, argument parsing, and `process.exit` inside
 * this adapter, we guarantee that the core logic remains environment-agnostic
 * and the CLI behaves identically to the MCP endpoints.
 */
import { sendTelegramMessage } from "@nodalkit/nodalkit-core";

const program = new Command();

const configPath = join(homedir(), ".config", "nodalkit", "config.json");

const cliConfigSchema = z.object({
  telegramBotToken: z.string().min(1).optional(),
});

function writeTelegramBotToken(token: string) {
  mkdirSync(dirname(configPath), { recursive: true });

  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        telegramBotToken: token,
      },
      null,
      2,
    )}\n`,
    {
      mode: 0o600,
    },
  );
}

/**
 * Securely retrieve the locally configured bot token.
 *
 * Credential Injection Strategy:
 * We store this in the user's home directory so it persists across shell sessions.
 * This is the CLI's specific implementation of credential resolution.
 * MCP servers, by contrast, rely on their respective environments (client env vars
 * or HTTP requests) to fetch tokens dynamically, ensuring secrets never leak
 * into the tool input payload.
 */
function getTelegramBotToken() {
  if (!existsSync(configPath)) {
    throw new Error("Telegram bot token is not configured. Run `nodalkit init`.");
  }

  const config = cliConfigSchema.parse(JSON.parse(readFileSync(configPath, "utf8")));

  if (!config.telegramBotToken) {
    throw new Error("Telegram bot token is not configured. Run `nodalkit init`.");
  }

  return config.telegramBotToken;
}

const colors = {
  primary: chalk.hex("#14B8A6"),
  accent: chalk.hex("#5EEAD4"),
  warning: chalk.hex("#F59E0B"),
  error: chalk.hex("#EF4444"),
  muted: chalk.hex("#94A3B8"),
};

console.log(`
${colors.primary("┌────────────────────────────┐")}
${colors.primary("│")} ${chalk.bold.white("NodalKit")}                   ${colors.primary("│")}
${colors.primary("│")} ${colors.muted("Build • Connect • Extend")}   ${colors.primary("│")}
${colors.primary("└────────────────────────────┘")}
`);

program
  .name("nodalkit")
  .description("CLI for NodalKit tools, integrations, and agent workflows")
  .version("1.0.0");

program
  .command("init")
  .description("Configure NodalKit CLI local settings")
  .requiredOption("--telegram-bot-token <botToken>", "Telegram bot token")
  .action(async (options: { telegramBotToken: string }) => {
    writeTelegramBotToken(options.telegramBotToken);

    console.log(
      [
        "",
        colors.primary("┌─────────────────────────┐"),
        `${colors.primary("│")} ${colors.primary.bold("✓ Configuration saved")}   ${colors.primary("│")}`,
        colors.primary("└─────────────────────────┘"),
        "",
        `${colors.muted("Location")}  ${chalk.white(configPath)}`,
        "",
      ].join("\n"),
    );
  });

program
  .command("telegram")
  .description("Send a Telegram message")
  .argument("<chatId>", "Telegram chat ID")
  .argument("<message>", "Message text to send")
  .action(async (chatId: string, message: string) => {
    console.log("");
    console.log(colors.accent.bold("◉ Sending Telegram message..."));

    const result = await sendTelegramMessage({
      botToken: getTelegramBotToken(),
      chatId,
      message,
    });

    console.log(
      [
        "",
        colors.primary("┌─────────────────────────────┐"),
        `${colors.primary("│")} ${colors.primary.bold("✓ Message sent successfully")} ${colors.primary("│")}`,
        colors.primary("└─────────────────────────────┘"),
        "",
        `${colors.muted("Chat ID")}     ${chalk.white(result.chatId)}`,
        `${colors.muted("Message ID")}  ${chalk.white(String(result.messageId))}`,
        "",
      ].join("\n"),
    );
  });

await program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(
    [
      "",
      colors.error("┌────────────────────────────┐"),
      `${colors.error("│")} ${colors.error.bold("✖ Command failed")}           ${colors.error("│")}`,
      colors.error("└────────────────────────────┘"),
      "",
      colors.error(message),
      "",
    ].join("\n"),
  );

  process.exitCode = 1;
});
