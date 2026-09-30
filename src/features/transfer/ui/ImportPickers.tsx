import type { MutableRefObject, RefObject } from "react";
import { IMPORT_ACCEPT } from "@/entities/outline";

/**
 * The two hidden pickers the import commands click: one for files, one for a
 * whole folder. The menu and the palette open them through the refs.
 */
export function ImportPickers({
  fileRef,
  folderRef,
  onFiles
}: {
  fileRef: RefObject<HTMLInputElement>;
  folderRef: MutableRefObject<HTMLInputElement | null>;
  onFiles(files: File[]): void;
}) {
  const take = (input: HTMLInputElement) => {
    const files = [...(input.files ?? [])];
    if (files.length > 0) onFiles(files);
    input.value = "";
  };
  return (
    <>
      <input ref={fileRef} type="file" accept={IMPORT_ACCEPT} multiple hidden onChange={(event) => take(event.target)} />

      {/*
        A second input rather than a flag on the first: `webkitdirectory` turns
        a file picker into a directory picker outright, so one input cannot
        offer both. It has no React prop and no `accept` the browser honours —
        `importFiles` does that filtering itself.
      */}
      <input
        ref={(element) => {
          folderRef.current = element;
          element?.setAttribute("webkitdirectory", "");
        }}
        type="file"
        multiple
        hidden
        onChange={(event) => take(event.target)}
      />
    </>
  );
}
