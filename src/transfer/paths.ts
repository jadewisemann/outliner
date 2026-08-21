/**
 * Reading the shape of what a file picker handed over.
 *
 * A pick is not just a bag of files — a directory pick carries the tree the
 * user arranged, and that tree is part of what is being imported.
 */

/**
 * Where the file sat in what was picked.
 *
 * `webkitRelativePath` is filled in only when a directory was chosen; a plain
 * multi-file pick leaves it empty, so the name is the fallback — which is the
 * flat behaviour this had before directories were read at all.
 */
export function pathOf(file: File): string {
  return file.webkitRelativePath || file.name;
}

/**
 * The directory part of a relative path, `""` at the top level.
 *
 * The chosen directory is itself a segment, so picking `Dynalist/` yields a
 * `Dynalist` folder holding the import. That is the faithful reading of what
 * was pointed at, and it keeps one import in one place instead of scattering
 * its top level among documents that were already there.
 *
 * `.` and `..` are dropped rather than followed. They do not appear in a
 * `webkitRelativePath`, but this decides where notes get filed, so a segment
 * that could mean "go up" is not given the chance to.
 */
export function directoryOf(path: string): string {
  return path
    .split("/")
    .slice(0, -1)
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
    .join("/");
}
