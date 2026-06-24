import chalk from "chalk";
import { Command } from "commander";
import { sendTelegramMessage } from "nodalkit-core";

const program = new Command();

const brand = chalk.hex("#6366F1");

console.log(
  brand.bold(`
╔══════════════════════════════════════╗
║              NodalKit               ║
║      Build • Connect • Extend       ║
╚══════════════════════════════════════╝
`),
);

/*
To get the chatId:
https://api.telegram.org/bot<bot-token>/getUpdates
*/

program
  .name("nodalkit")
  .description("NodalKit CLI for agent tools and integrations")
  .version("0.1.0");

program
  .command("telegram")
  .description("Send a Telegram message")
  .argument("<chatId>", "Telegram chat ID")
  .argument("<message>", "Message text to send")
  .action(async (chatId: string, message: string) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      console.error(
        chalk.red.bold("✖ Missing TELEGRAM_BOT_TOKEN environment variable"),
      );
      process.exit(1);
    }

    if (!chatId) {
      console.error(chalk.red.bold("✖ Missing Telegram chat ID"));
      process.exit(1);
    }

    if (!message) {
      console.error(chalk.red.bold("✖ Missing Telegram message text"));
      process.exit(1);
    }

    console.log(chalk.cyan("\n▶ Sending Telegram message...\n"));

    try {
      const result = await sendTelegramMessage({
        botToken: token,
        chatId,
        message,
      });

      console.log(chalk.green.bold("✓ Message sent successfully"));
      console.log(`${chalk.gray("Chat ID")}     ${chalk.white(result.chatId)}`);
      console.log(
        `${chalk.gray("Message ID")}  ${chalk.white(result.messageId)}`,
      );
      console.log("");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      console.error(chalk.red.bold("✖ Telegram API request failed"));
      console.error(chalk.red(detail));
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
