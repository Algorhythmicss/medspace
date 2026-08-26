import { parsePatientRoster, prepareRosterImport, rosterLookupKeys } from "../src/lib/rosterCsv";

function expect(condition: boolean, label: string) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else console.log(`ok: ${label}`);
}

const parsed = parsePatientRoster(
  '\uFEFFPatient Name,Mobile,Age,Gender,OPD No\r\n"Devi, Meera",+91 98765 43101,63,Female,420\r\nRavi,9988776655,41,m,\r\n,,,,\r\n'
);

expect(parsed.rows.length === 2, "two named patients are parsed");
expect(parsed.rows[0].name === "Devi, Meera", "quoted commas stay inside a patient name");
expect(parsed.rows[0].phone === "+91 98765 43101", "formatted phone is carried to normalisation");
expect(parsed.rows[0].ageYears === 63, "age is parsed");
expect(parsed.rows[0].sex === "F", "gender aliases normalize to the chart value");
expect(parsed.rows[0].fileNumber === 420, "OPD number alias maps to file number");
expect(parsed.rows[1].fileNumber === null, "missing file number remains optional");
expect(parsed.skipped === 0, "an empty trailing row is not reported as a bad patient");

const invalid = parsePatientRoster("Name,Age,Sex\nValid,999,unknown\n,40,M\n");
expect(invalid.rows[0].ageYears === null, "impossible age is dropped rather than imported");
expect(invalid.rows[0].sex === null, "unknown sex is dropped rather than invented");
expect(invalid.skipped === 1, "a non-empty row with no name is counted as skipped");

let missingNameRejected = false;
try {
  parsePatientRoster("Phone,Age\n9876543210,50\n");
} catch (error) {
  missingNameRejected = (error as Error).message === "missing_name_column";
}
expect(missingNameRejected, "a roster without a name column is rejected");

const allocationRows = parsePatientRoster(
  "Name,Phone,File number\nExisting,+91 98765 43101,700\nDuplicate row,9876543101,701\nFile clash,9988776655,700\nFresh,,\n"
).rows;
const keys = rosterLookupKeys(allocationRows);
expect(keys.phones.includes("9876543101"), "roster lookup canonicalises formatted mobile numbers");
expect(keys.phones.length === 2, "lookup keys collapse duplicate mobile formats");

const prepared = prepareRosterImport({
  rows: allocationRows,
  existingPhones: ["9876543101"],
  existingFileNumbers: [700],
  maxFileNumber: 700,
});
expect(prepared.data.length === 2, "existing and repeated phone rows are skipped");
expect(prepared.skipped === 2, "every duplicate phone row is counted");
expect(prepared.data[0].name === "File clash", "a new phone remains importable despite file clash");
expect(prepared.data[0].fileNumber === 701, "a conflicting file number is reassigned");
expect(prepared.data[1].fileNumber === 702, "missing file number receives the next free number");

console.log(process.exitCode ? "TESTS FAILED" : "ALL PASS");
