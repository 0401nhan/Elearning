import { main } from "./import-questions-from-docx.mjs";

main(process.argv[2]).catch((error) => {
  console.error("Failed to seed demo questions:");
  console.error(error);
  process.exit(1);
});
