import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function createAnalyticsNotes(root) {
  const file = path.join(root, ".local", "analytics-notes.json");
  let writes = Promise.resolve();
  async function read() {
    try {
      const value = JSON.parse(await fs.readFile(file, "utf8"));
      if (!Array.isArray(value)) throw new Error("제출일 기록 파일 형식을 확인해 주세요.");
      return value;
    } catch (error) { if (error.code === "ENOENT") return []; throw error; }
  }
  function validate(input) {
    const date = String(input.date || "");
    const label = String(input.label || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
      throw new Error("올바른 제출일을 입력해 주세요.");
    }
    if (!label || label.length > 120) throw new Error("기록 제목은 1~120자로 입력해 주세요.");
    return { date, label };
  }
  function mutate(callback) {
    const operation = writes.then(async () => {
      const notes = callback(await read());
      if (notes.length > 1000) throw new Error("제출일 기록은 최대 1,000개까지 저장할 수 있습니다.");
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temporary = file + ".tmp";
      await fs.writeFile(temporary, JSON.stringify(notes, null, 2) + "\n", { mode: 0o600 });
      await fs.rename(temporary, file);
      return notes;
    });
    writes = operation.catch(() => {});
    return operation;
  }
  return {
    read,
    add(input) {
      const note = { id: randomUUID(), ...validate(input) };
      return mutate(notes => [...notes, note].sort((a, b) => a.date.localeCompare(b.date)));
    },
    remove(id) {
      if (!/^[a-f0-9-]{36}$/i.test(String(id))) throw new Error("기록 ID가 올바르지 않습니다.");
      return mutate(notes => notes.filter(note => note.id !== id));
    }
  };
}
