import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export type UiControl = { file: string; line: number; tag: string; type: string; styles: string[] };
export function uiSourceFiles(root = process.cwd()): string[] {
  const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : entry.name.endsWith(".tsx") ? [file] : [];
  });
  return ["src/app", "src/components"].flatMap(directory => walk(path.join(root, directory)));
}

/** Source guard complements browser checks, including conditional controls that
 * cannot all be visible in one transaction state. Local aliases must resolve to
 * an actual import from the shared design system. */
export function auditUiSource(root = process.cwd()) {
  const controls: UiControl[] = [], handlerControls: UiControl[] = [], violations: string[] = [];
  const files = uiSourceFiles(root);
  for (const file of files) {
    const relative = path.relative(root, file).replaceAll("\\", "/");
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const imported = new Map<string, string>(), aliases = new Map<string, ts.Expression>();
    const index = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "@/components/ui/primitives") {
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) imported.set(binding.name.text, binding.propertyName?.text ?? binding.name.text);
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) aliases.set(node.name.text, node.initializer);
      ts.forEachChild(node, index);
    };
    index(source);
    // primitives defines the tokens; its own controls follow the same contract.
    if (relative === "src/components/ui/primitives.tsx") for (const name of ["buttonStyles", "fieldStyles", "checkStyles", "linkStyles", "disclosureStyles"]) imported.set(name, name);
    const references = (node: ts.Node, seen = new Set<string>()): string[] => {
      if (ts.isIdentifier(node)) {
        if (imported.has(node.text)) return [imported.get(node.text)!];
        if (aliases.has(node.text) && !seen.has(node.text)) return references(aliases.get(node.text)!, new Set([...seen, node.text]));
      }
      const result: string[] = [];
      ts.forEachChild(node, child => { result.push(...references(child, seen)); });
      return result;
    };
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(source);
        const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
        const attribute = (name: string) => attributes.find(attr => attr.name.getText(source) === name)?.initializer;
        const typeNode = attribute("type");
        const type = typeNode && ts.isStringLiteral(typeNode) ? typeNode.text : "";
        if (["button", "a", "Link", "input", "select", "textarea", "summary"].includes(tag) && type !== "hidden") {
          const classNode = attribute("className");
          const styles = classNode ? [...new Set(references(classNode))] : [];
          const location = `${relative}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
          // Native file input is keyboard focusable inside a shared button label.
          const uploadLabel = node.parent && ts.isJsxElement(node.parent) && node.parent.openingElement.tagName.getText(source) === "label"
            && node.parent.openingElement.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.getText(source) === "className" && attr.initializer && references(attr.initializer).includes("buttonStyles"));
          const upload = type === "file" && classNode && ts.isStringLiteral(classNode) && classNode.text === "sr-only" && uploadLabel && attribute("aria-label");
          const allowed = tag === "button" ? ["buttonStyles"] : tag === "Link" || tag === "a" ? ["buttonStyles", "linkStyles"] : tag === "summary" ? ["disclosureStyles"] : type === "checkbox" || type === "radio" ? ["checkStyles"] : ["fieldStyles"];
          controls.push({ file: relative, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, tag, type, styles: upload ? ["accessible-upload"] : styles });
          if (!upload && !styles.some(style => allowed.includes(style))) violations.push(`${location} <${tag}> must use ${allowed.join(" / ")}`);
          if ((tag === "a" || tag === "Link") && classNode && /\b(?:linkStyles\.inline|buttonStyles\.textAction)\b/.test(classNode.getText(source))) violations.push(`${location} URL actions must use a visible button surface rather than a text-only link`);
          if (styles.includes("buttonStyles") && classNode) {
            const literals: string[] = [];
            const findText = (value: ts.Node) => { if (ts.isStringLiteralLike(value) || ts.isTemplateHead(value) || ts.isTemplateMiddle(value) || ts.isTemplateTail(value)) literals.push(value.text); ts.forEachChild(value, findText); };
            findText(classNode);
            const overrides = literals.join(" ").split(/\s+/).filter(token => /^(?:[\w-]+:)*(?:bg-|text-(?:xs|sm|base|lg|xl|[2-9]xl|slate|stone|red|amber|white|black)|rounded|border-(?:slate|stone|red|amber)|p[xy]?-[\d]|min-h-|focus|hover|disabled)/.test(token));
            if (overrides.length) violations.push(`${location} shared button visual overrides: ${overrides.join(" ")}`);
          }
          if (attribute("style")) violations.push(`${location} <${tag}> cannot override shared styles inline`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const routes = files.filter(file => path.basename(file) === "page.tsx").map(file => "/" + path.relative(path.join(root, "src/app"), path.dirname(file)).replaceAll("\\", "/").split("/").filter(part => part && !part.startsWith("(")).join("/")).sort();
  const handlers = (directory: string): string[] => !existsSync(directory) ? [] : readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? handlers(path.join(directory, entry.name)) : entry.name === "route.ts" ? [path.join(directory, entry.name)] : []);
  for (const file of handlers(path.join(root, "src/app/api"))) {
    const text = readFileSync(file, "utf8"), relative = path.relative(root, file).replaceAll("\\", "/");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const names = new Set<string>();
    for (const statement of source.statements) if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === "@/components/ui/standalone-page") {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) if ((binding.propertyName?.text ?? binding.name.text) === "standalonePrimaryClassName") names.add(binding.name.text);
    }
    for (const match of text.matchAll(/<(button|a|input|select|textarea|summary)\b[^>]*>/g)) {
      if (/type=["']hidden["']/.test(match[0])) continue;
      const line = text.slice(0, match.index).split("\n").length;
      const shared = [...names].some(name => match[0].includes('class="${' + name + '}"')) && text.includes("standalonePageStyleHash") && text.includes("standalonePageStyles");
      handlerControls.push({ file: relative, line, tag: match[1], type: "submit", styles: shared ? ["standalonePrimaryClassName"] : [] });
      if (!shared || /\sstyle=/.test(match[0])) violations.push(`${relative}:${line} route-handler HTML control must use the CSP-hashed standalone design contract`);
    }
  }
  return { routes, controls, handlerControls, violations };
}
