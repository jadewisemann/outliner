import { describe, expect, it } from "vitest";
import { createKeyring, isLocked, plainKeyring } from "../api/cipher";

const notes = JSON.stringify({ title: "회의록", nodes: { a: { text: "비밀번호는 여기 적지 말 것" } } });

describe("end-to-end encryption", () => {
  it("round-trips through a sealed envelope that gives nothing away", async () => {
    const keys = createKeyring("correct horse");
    const sealed = await keys.seal(notes);

    expect(sealed).not.toContain("회의록");
    expect(sealed).not.toContain("비밀번호");
    expect(await keys.open(sealed)).toBe(notes);
  });

  it("lets a second device with the same passphrase read the first one's files", async () => {
    const laptop = createKeyring("correct horse");
    const phone = createKeyring("correct horse");
    // The phone has never sealed anything, so it learns the salt from the file.
    expect(await phone.open(await laptop.seal(notes))).toBe(notes);
  });

  it("refuses the wrong passphrase instead of returning something plausible", async () => {
    const sealed = await createKeyring("correct horse").seal(notes);
    await expect(createKeyring("battery staple").open(sealed)).rejects.toSatisfy(isLocked);
  });

  it("refuses ciphertext when no passphrase is set, rather than reading it as empty", async () => {
    // Treating an unreadable file as an absent one is how a workspace gets
    // overwritten with nothing.
    const sealed = await createKeyring("correct horse").seal(notes);
    await expect(plainKeyring().open(sealed)).rejects.toSatisfy(isLocked);
  });

  it("still reads a workspace written before the passphrase was set", async () => {
    expect(await createKeyring("correct horse").open(notes)).toBe(notes);
    expect(await plainKeyring().open(notes)).toBe(notes);
  });

  it("uses a fresh initialisation vector every time", async () => {
    const keys = createKeyring("correct horse");
    expect(await keys.seal(notes)).not.toBe(await keys.seal(notes));
  });

  it("ignores an envelope demanding a derivation that would never finish", async () => {
    const hostile = JSON.stringify({
      v: 1,
      kdf: "PBKDF2-SHA256",
      iterations: 1e12,
      salt: "AAAA",
      iv: "AAAA",
      ct: "AAAA"
    });
    // Not an envelope this device will act on: handed back for the validator
    // to discard, rather than freezing the tab in a key derivation.
    expect(await createKeyring("correct horse").open(hostile)).toBe(hostile);
  });
});
