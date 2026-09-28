/*
 * Copyright 2026 Telefónica Soluciones de Informática y Comunicaciones de España, S.A.U.
 *
 * This file is part of kafnus
 *
 * kafnus is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * kafnus is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
 * General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with kafnus. If not, see http://www.gnu.org/licenses/.
 */

// Turns the raw V8 coverage written by the kafnus-ngsi container during the
// end-to-end tests (KAFNUS_TESTS_NGSI_COVERAGE=true) into an lcov report at
// coverage-e2e/lcov.info. The container runs the code from CONTAINER_ROOT, so
// script URLs are rewritten to this checkout before handing them to c8, which
// needs to read the sources. The image must be built from this same checkout.

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFileSync } = require('child_process');

const CONTAINER_ROOT = 'file:///opt/kafnus/kafnus-ngsi/';
const projectRoot = path.resolve(__dirname, '..');
const reportsDir = path.join(projectRoot, 'coverage-e2e');
const rawDir = path.join(reportsDir, 'raw');
const tmpDir = path.join(reportsDir, 'tmp');
const localRoot = pathToFileURL(projectRoot).href + '/';

const rawFiles = fs.existsSync(rawDir) ? fs.readdirSync(rawDir).filter((f) => f.endsWith('.json')) : [];
if (rawFiles.length === 0) {
    console.error(`No V8 coverage found in ${rawDir}. Run the e2e tests with KAFNUS_TESTS_NGSI_COVERAGE=true first.`);
    process.exit(1);
}

fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

for (const file of rawFiles) {
    const coverage = JSON.parse(fs.readFileSync(path.join(rawDir, file), 'utf8'));
    // Keep only kafnus-ngsi's own scripts (drop node internals and dependencies)
    coverage.result = coverage.result
        .filter((script) => script.url.startsWith(CONTAINER_ROOT) && !script.url.includes('/node_modules/'))
        .map((script) => ({ ...script, url: localRoot + script.url.slice(CONTAINER_ROOT.length) }));
    delete coverage['source-map-cache'];
    fs.writeFileSync(path.join(tmpDir, file), JSON.stringify(coverage));
}

execFileSync(
    'npx',
    [
        'c8',
        'report',
        '--temp-directory',
        tmpDir,
        '--reports-dir',
        reportsDir,
        '--reporter=lcov',
        '--reporter=text-summary',
        '--exclude=scripts/**',
        '--exclude=tests/**'
    ],
    { cwd: projectRoot, stdio: 'inherit' }
);
fs.rmSync(tmpDir, { recursive: true, force: true });
