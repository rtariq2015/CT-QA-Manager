const fs = require("fs");
const path = require("path");
const { createHash, randomUUID } = require("crypto");

const hash = (value) => createHash("sha256").update(value).digest("hex");
const validKey = /^[a-f0-9]{64}$/;
const scanners = new Set(["xcite", "flash", "edge", "drive"]);
const reportTypes = new Set(["Daily", "Monthly", "Other"]);
const printedStatuses = new Set(["OK", "NOT OK", "Aborted", "Not available"]);

function validMeasurement(reading) {
  return reading && typeof reading.metric === "string" && typeof reading.context === "string" && typeof reading.unit === "string" &&
    Number.isFinite(reading.value) && Number.isFinite(reading.lower) && Number.isFinite(reading.upper) && reading.lower <= reading.upper &&
    (reading.baseline === null || Number.isFinite(reading.baseline)) && Number.isInteger(reading.page) && reading.page > 0 &&
    (reading.referenceTest === undefined || typeof reading.referenceTest === "boolean");
}

function validReport(report) {
  return report && typeof report.id === "string" && typeof report.fileName === "string" && scanners.has(report.scanner) &&
    reportTypes.has(report.type) && reportTypes.has(report.suggested) &&
    typeof report.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(report.date) &&
    typeof report.time === "string" && /^\d{2}:\d{2}(?::\d{2})?$/.test(report.time) &&
    Array.isArray(report.measurements) && report.measurements.every(validMeasurement) &&
    (report.printedStatus === undefined || printedStatuses.has(report.printedStatus)) &&
    (report.printedSections === undefined || (Array.isArray(report.printedSections) && report.printedSections.every((section) =>
      section && typeof section.label === "string" && printedStatuses.has(section.status) && Number.isInteger(section.page)))) &&
    (report.extractionNotes === undefined || (Array.isArray(report.extractionNotes) && report.extractionNotes.every((note) => typeof note === "string")));
}

function createCatalog(libraryRoot) {
  const directory = () => path.join(libraryRoot(), ".catalog");
  let records;
  const seen = new Map();

  function load() {
    if (records) return records;
    const found = new Map();
    if (fs.existsSync(directory())) {
      for (const entry of fs.readdirSync(directory(), { withFileTypes: true })) {
        if (!entry.isFile() || !validKey.test(entry.name.slice(0, -5)) || !entry.name.endsWith(".json")) continue;
        try {
          const item = JSON.parse(fs.readFileSync(path.join(directory(), entry.name), "utf8"));
          if (item.version !== 1 || !validReport(item.report) || typeof item.path !== "string" ||
              entry.name !== `${hash(item.report.id)}.json`) continue;
          const key = hash(item.report.id);
          found.set(key, item);
          for (const source of Object.values(item.sources ?? {})) seen.set(source, key);
        } catch { /* one damaged entry does not prevent opening the rest */ }
      }
    }
    records = found;
    return records;
  }

  function localPdf(record) {
    if (!record) return undefined;
    try {
      const root = fs.realpathSync(libraryRoot());
      const file = fs.realpathSync(path.resolve(root, record.path));
      const relative = path.relative(root, file);
      if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative) || !relative.toLowerCase().endsWith(".pdf")) return undefined;
      return fs.statSync(file).isFile() ? file : undefined;
    } catch { return undefined; }
  }

  function save({ reportId, report, target, bytes, source }) {
    if (typeof reportId !== "string") return;
    const index = load();
    const key = hash(reportId);
    const previous = index.get(key);
    const metadata = report ?? previous?.report;
    if (!metadata || metadata.id !== reportId) return;
    if (!validReport(metadata)) throw new Error("Invalid report metadata");
    const digest = hash(bytes);
    const sources = previous?.digest === digest ? { ...previous.sources } : {};
    if (typeof source === "string" && /^[a-f0-9]{64}:[a-f0-9]{64}$/.test(source)) {
      sources[source.slice(0, 64)] = source;
    }
    const entry = {
      version: 1, report: { ...metadata, originalUrl: undefined },
      path: path.relative(libraryRoot(), target), digest, sources,
    };
    fs.mkdirSync(directory(), { recursive: true });
    const temporary = path.join(directory(), `${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temporary, JSON.stringify(entry), { flag: "wx" });
      fs.renameSync(temporary, path.join(directory(), `${key}.json`));
    } finally {
      fs.rmSync(temporary, { force: true });
    }
    for (const old of Object.values(previous?.sources ?? {})) {
      if (seen.get(old) === key) seen.delete(old);
    }
    for (const current of Object.values(sources)) seen.set(current, key);
    index.set(key, entry);
  }

  return {
    save,
    hasSource(source) {
      const index = load();
      return Boolean(localPdf(index.get(seen.get(source))));
    },
    hasAnotherReference(file, reportId) {
      const relative = path.relative(libraryRoot(), file);
      return [...load().values()].some((item) => item.report.id !== reportId && item.path === relative);
    },
    fileForReport(reportId) {
      return typeof reportId === "string" ? localPdf(load().get(hash(reportId))) : undefined;
    },
    pdf(key) { return validKey.test(key) ? localPdf(load().get(key)) : undefined; },
    reports(url) {
      return [...load()].map(([key, item]) => ({
        ...item.report,
        originalUrl: localPdf(item) ? `${url}saved-report/${key}.pdf` : undefined,
      }));
    },
  };
}

function sourceFingerprint(file, stat) {
  const key = hash(path.normalize(file));
  const stamp = hash(JSON.stringify([stat.size, stat.mtimeMs, stat.ctimeMs]));
  return `${key}:${stamp}`;
}

module.exports = { createCatalog, sourceFingerprint };
