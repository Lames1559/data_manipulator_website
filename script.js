// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const processBtn = document.getElementById('processBtn');
const status = document.getElementById('status');
const progress = document.getElementById('progress');
const progressText = document.getElementById('progressText');

// Event Listeners
uploadArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
processBtn.addEventListener('click', processFile);

// Drag and drop handlers
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        fileInput.files = files;
        handleFileSelect();
    }
});

// UI Functions
function handleFileSelect() {
    const file = fileInput.files[0];
    if (file) {
        fileName.textContent = file.name;
        fileInfo.style.display = 'block';
        processBtn.disabled = false;
        hideStatus();
    }
}

function showStatus(message, type) {
    status.textContent = message;
    status.className = 'status show ' + type;
}

function hideStatus() {
    status.className = 'status';
}

function showProgress(text) {
    progress.style.display = 'block';
    progressText.textContent = text;
}

function hideProgress() {
    progress.style.display = 'none';
}

// Utility Functions
function findColumnCaseInsensitive(columns, targetCol) {
    const targetLower = targetCol.toLowerCase();
    return columns.find(col => col.toLowerCase() === targetLower);
}

function isNumeric(value) {
    return !isNaN(parseFloat(value)) && isFinite(value);
}

// Data Processing Functions
function filterByIndik(data, columns) {
    const indikCol = findColumnCaseInsensitive(columns, 'indik');
    if (!indikCol) {
        throw new Error('INDIK column not found');
    }
    
    const pnrCol = findColumnCaseInsensitive(columns, 'pnr');
    if (!pnrCol) {
        throw new Error('PNR column not found (needed for INDIK filtering)');
    }
    
    // Find all PNRs that have at least one INDIK = 8 entry
    // Use loose equality and parseFloat to handle both integers and floats
    const pnrsWithIndik8 = new Set();
    data.forEach(row => {
        const indikValue = row[indikCol];
        // Check if value is 8 (handles 8, 8.0, "8", "8.0")
        if (indikValue != null && parseFloat(indikValue) === 8) {
            pnrsWithIndik8.add(row[pnrCol]);
        }
    });
    
    if (pnrsWithIndik8.size === 0) {
        // Debug info to help diagnose the issue
        const uniqueIndikValues = new Set();
        data.forEach(row => {
            const val = row[indikCol];
            if (val != null) uniqueIndikValues.add(val);
        });
        const indikSample = Array.from(uniqueIndikValues).slice(0, 10);
        throw new Error(`No patients with INDIK = 8 found. Found these INDIK values: ${indikSample.join(', ')}`);
    }
    
    // Keep all rows for patients who have at least one INDIK = 8
    const filtered = data.filter(row => pnrsWithIndik8.has(row[pnrCol]));
    
    if (filtered.length === 0) {
        throw new Error('No rows found for patients with INDIK = 8');
    }
    
    return { data: filtered, column: indikCol };
}

function filterByVmax(data, columns) {
    const vmaxCol = findColumnCaseInsensitive(columns, 'Vmax (m/s)');
    if (!vmaxCol) {
        throw new Error('Vmax (m/s) column not found');
    }
    
    const pnrCol = findColumnCaseInsensitive(columns, 'pnr');
    if (!pnrCol) {
        throw new Error('PNR column not found (needed for Vmax filtering)');
    }
    
    // Find all PNRs that have at least one Vmax >= 4.0
    const pnrsWithVmax = new Set();
    data.forEach(row => {
        const val = parseFloat(row[vmaxCol]);
        if (!isNaN(val) && val >= VMAX_THRESHOLD) {
            pnrsWithVmax.add(row[pnrCol]);
        }
    });
    
    if (pnrsWithVmax.size === 0) {
        throw new Error(`No patients with Vmax (m/s) >= ${VMAX_THRESHOLD} found`);
    }
    
    // Keep all rows for patients who have at least one Vmax >= threshold
    const filtered = data.filter(row => pnrsWithVmax.has(row[pnrCol]));
    
    if (filtered.length === 0) {
        throw new Error(`No rows found for patients with Vmax (m/s) >= ${VMAX_THRESHOLD}`);
    }
    
    return filtered;
}

function filterByPatientFrequency(data, columns) {
    const pnrCol = findColumnCaseInsensitive(columns, 'pnr');
    if (!pnrCol) {
        throw new Error('PNR column not found');
    }
    
    // Count occurrences
    const pnrCounts = {};
    data.forEach(row => {
        const pnr = row[pnrCol];
        pnrCounts[pnr] = (pnrCounts[pnr] || 0) + 1;
    });
    
    // Keep only patients with >=5 visits
    const validPnrs = Object.keys(pnrCounts).filter(pnr => pnrCounts[pnr] >= 5);
    const filtered = data.filter(row => validPnrs.includes(String(row[pnrCol])));
    
    if (filtered.length === 0) {
        throw new Error('No patients with 5+ visits found');
    }
    
    return { data: filtered, patientCount: validPnrs.length };
}

function getColumnsToRemove(columns, indikCol) {
    const columnsToDrop = [];
    
    // Add columns marked "rm" in feature map
    for (const [mapCol, action] of Object.entries(FEATURE_MAP)) {
        if (action === 'rm') {
            const actualCol = findColumnCaseInsensitive(columns, mapCol);
            if (actualCol) columnsToDrop.push(actualCol);
        }
    }
    
    // Always drop INDIK
    if (indikCol && !columnsToDrop.includes(indikCol)) {
        columnsToDrop.push(indikCol);
    }
    
    return columnsToDrop;
}

function anonymizeNumericValues(data, columns) {
    let modifiedCount = 0;
    
    for (const [mapCol, action] of Object.entries(FEATURE_MAP)) {
        if (typeof action === 'number') {
            const actualCol = findColumnCaseInsensitive(columns, mapCol);
            if (!actualCol) continue;
            
            data.forEach(row => {
                const value = row[actualCol];
                if (value != null && isNumeric(value)) {
                    const modification = (Math.random() * 2 - 1) * action;
                    const newValue = parseFloat(value) + modification;
                    
                    // Round based on action value
                    if (action >= 1.0) {
                        row[actualCol] = Math.round(newValue);
                    } else {
                        row[actualCol] = Math.round(newValue * 10) / 10;
                    }
                    modifiedCount++;
                }
            });
        }
    }
    
    return modifiedCount;
}

function random(min,max) {
 return Math.floor((Math.random())*(max-min+1))+min;
}

function createID(data, columns) {
    const pnrCol = findColumnCaseInsensitive(columns, 'pnr');
    if (!pnrCol) {
        throw new Error('PNR column not found');
    }

    const pnrUniques = new Set();
    data.forEach(row => {
        pnrUniques.add(row[pnrCol])
    });

    const pnrMapping = {};
    let counter = random(1000000, 9999999); // Start from random point
    pnrUniques.forEach(pnr => {
        pnrMapping[pnr] = counter++;
    });

    const anonData = data.map(row => ({
        ...row,
        [pnrCol]: pnrMapping[row[pnrCol]]
    }))

    return anonData
}

function anonymizeDates(data, columns) {
    const pnrCol = findColumnCaseInsensitive(columns, 'pnr');
    const dateCol = findColumnCaseInsensitive(columns, 'Datum');
    
    if (!pnrCol || !dateCol) {
        throw new Error('PNR or date column not found');
    }
    
    // Group rows by patient with their original indices
    const patientVisits = {};
    data.forEach((row, idx) => {
        const pnr = row[pnrCol];
        if (!patientVisits[pnr]) {
            patientVisits[pnr] = [];
        }
        patientVisits[pnr].push({ row, idx });
    });
    
    // For each patient, sort by date and assign visit numbers
    Object.values(patientVisits).forEach(visits => {
        // Sort by date
        visits.sort((a, b) => {
            const dateA = new Date(a.row[dateCol]);
            const dateB = new Date(b.row[dateCol]);
            return dateA - dateB;
        });
        
        // Assign visit numbers to the actual data
        visits.forEach((visit, visitNum) => {
            data[visit.idx][dateCol] = visitNum;
        });
    });
    
    return data;
}

function calculateAVA(data, columns) {
    const lvotDiamCol = findColumnCaseInsensitive(columns, 'LVOT Diam');
    const lvotVtiCol = findColumnCaseInsensitive(columns, 'LVOTI (cm)');
    const aorticVtiCol = findColumnCaseInsensitive(columns, 'VTI (cm)_1');
    
    if (!lvotDiamCol || !lvotVtiCol || !aorticVtiCol) {
        throw new Error('Required columns for AVA calculation not found');
    }
    
    let calculatedCount = 0;
    
    data.forEach(row => {
        const lvotDiamMm = parseFloat(row[lvotDiamCol]);
        const lvotVti = parseFloat(row[lvotVtiCol]);
        const aorticVti = parseFloat(row[aorticVtiCol]);
        
        // Check if all values are valid numbers
        if (!isNaN(lvotDiamMm) && !isNaN(lvotVti) && !isNaN(aorticVti) && aorticVti !== 0) {
            // Convert LVOT diameter from mm to cm
            const lvotDiamCm = lvotDiamMm / 10;
            
            // Calculate AVA using continuity equation:
            // AVA = (LVOT area × LVOT VTI) / Aortic Valve VTI
            // LVOT area = π × (diameter/2)²
            const lvotArea = Math.PI * Math.pow(lvotDiamCm / 2, 2);
            const ava = (lvotArea * lvotVti) / aorticVti;
            
            // Round to 2 decimal places
            row['AVA'] = ava
            calculatedCount++;
        } else {
            row['AVA'] = null;
        }
    });
    
    return calculatedCount;
}

function removeColumns(data, columnsToDrop) {
    return data.map(row => {
        const newRow = {};
        for (const key in row) {
            if (!columnsToDrop.includes(key)) {
                newRow[key] = row[key];
            }
        }
        return newRow;
    });
}

function downloadCSV(data, originalFileName) {
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const fileName = originalFileName.replace(/\.[^/.]+$/, '');
    link.href = URL.createObjectURL(blob);
    link.download = fileName + '.csv';
    link.click();
}

// Main Processing Function
async function processFile() {
    const file = fileInput.files[0];
    if (!file) return;

    processBtn.disabled = true;
    hideStatus();
    
    try {
        showProgress('Reading file...');
        
        // Read Excel file
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        let jsonData = XLSX.utils.sheet_to_json(firstSheet);

        if (jsonData.length === 0) {
            throw new Error('File is empty');
        }

        showProgress(`File read: ${jsonData.length} rows`);
        
        // Get column names
        const columns = Object.keys(jsonData[0]);
        
        // Apply filters
        showProgress('Filtering by patients with at least one INDIK = 8...');
        const { data: indikFiltered, column: indikCol } = filterByIndik(jsonData, columns);
        showProgress(`Filtered to ${indikFiltered.length} rows (patients with INDIK = 8)`);
        
        showProgress(`Filtering by Vmax (m/s) > ${VMAX_THRESHOLD}...`);
        const vmaxFiltered = filterByVmax(indikFiltered, columns);
        showProgress(`Filtered to ${vmaxFiltered.length} rows (Vmax > ${VMAX_THRESHOLD})`);
        
        showProgress('Filtering by patient frequency (min 5 visits)...');
        const { data: frequencyFiltered, patientCount } = filterByPatientFrequency(vmaxFiltered, columns);
        showProgress(`Filtered to ${frequencyFiltered.length} rows (${patientCount} patients with 5+ visits)`);
        
        
        // Get columns to remove
        showProgress('Removing sensitive columns...');
        const columnsToDrop = getColumnsToRemove(columns, indikCol);

        // Anonymize values
        showProgress('Changing PNR to randomized values')
        const updatedData = createID(frequencyFiltered, columns)

        // Grabbing the dates and anonymyzing them
        showProgress('Anonymizing dates to visit numbers...');
        anonymizeDates(updatedData, columns);

        showProgress('Calculating AVA...');
        const avaCount = calculateAVA(updatedData, columns);
        showProgress(`Calculated AVA for ${avaCount} rows`);
        
        showProgress('Anonymizing numeric values...');
        const modifiedCount = anonymizeNumericValues(updatedData, columns);
        showProgress(`Modified ${modifiedCount} values`);
        
        // Remove sensitive columns
        const finalData = removeColumns(updatedData, columnsToDrop);
        
        // Generate and download CSV
        showProgress('Generating CSV file...');
        downloadCSV(finalData, file.name);
        
        hideProgress();
        showStatus(
            `✓ Success! Processed ${finalData.length} rows, removed ${columnsToDrop.length} columns. File downloaded.`,
            'success'
        );
        
    } catch (error) {
        hideProgress();
        showStatus(`✗ Error: ${error.message}`, 'error');
        console.error(error);
    } finally {
        processBtn.disabled = false;
    }
}