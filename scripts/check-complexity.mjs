import ts from "typescript";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const threshold = Number(process.argv[2] ?? 4);
const roots = ["src"];
const extensions = new Set([".ts"]);
const ignoredPatterns = [/\.test\.tsx?$/, /\/test\//];

const results = roots.flatMap((root) => collectFiles(root)).flatMap((file) => analyzeFile(file));
const measuredResults = results.filter((result) => !result.name.includes("anonymous"));
const violations = measuredResults.filter((result) => result.complexity > threshold);

for (const result of violations) {
  console.log(`${result.file}:${result.line} ${result.name} complexity ${result.complexity}`);
}

if (violations.length > 0) {
  console.error(`Cyclomatic complexity threshold exceeded: ${violations.length} function(s) above ${threshold}.`);
  process.exit(1);
}

console.log(`Cyclomatic complexity ok: ${measuredResults.length} named function(s) at or below ${threshold}.`);

function collectFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      return collectFiles(path);
    }
    if (!stats.isFile() || !extensions.has(path.slice(path.lastIndexOf(".")))) {
      return [];
    }
    const normalized = path.replaceAll("\\", "/");
    return ignoredPatterns.some((pattern) => pattern.test(normalized)) ? [] : [path];
  });
}

function analyzeFile(file) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const functions = [];

  visit(source, undefined);
  return functions;

  function visit(node, parentName) {
    if (isFunctionLike(node)) {
      const name = getFunctionName(node, parentName);
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      functions.push({
        file: relative(process.cwd(), file),
        line: line + 1,
        name,
        complexity: calculateComplexity(node)
      });
      visitFunctionChildren(node, name);
      return;
    }
    ts.forEachChild(node, (child) => visit(child, parentName));
  }

  function visitFunctionChildren(node, parentName) {
    if (node.body) {
      ts.forEachChild(node.body, (child) => visit(child, parentName));
    }
  }
}

function calculateComplexity(functionNode) {
  let complexity = 1;

  function visit(node) {
    if (node !== functionNode && isFunctionLike(node)) {
      return;
    }
    if (isDecisionPoint(node)) {
      complexity += 1;
    }
    ts.forEachChild(node, visit);
  }

  visit(functionNode);
  return complexity;
}

function isDecisionPoint(node) {
  return (
    ts.isIfStatement(node) ||
    ts.isConditionalExpression(node) ||
    ts.isCaseClause(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isCatchClause(node)
  );
}

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

function getFunctionName(node, parentName) {
  if (node.name?.text) {
    return node.name.text;
  }
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return parentName ? `${parentName}.anonymous` : "anonymous";
}
