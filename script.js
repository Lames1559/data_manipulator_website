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
    
    const filtered = data.filter(row => {
        const val = parseFloat(row[vmaxCol]);
        return !isNaN(val) && val > VMAX_THRESHOLD;
    });
    
    if (filtered.length === 0) {
        throw new Error(`No rows with Vmax (m/s) > ${VMAX_THRESHOLD}`);
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
        
        // Anonymize numeric values
        showProgress('Anonymizing numeric values...');
        const modifiedCount = anonymizeNumericValues(frequencyFiltered, columns);
        showProgress(`Modified ${modifiedCount} values`);
        
        // Remove sensitive columns
        const finalData = removeColumns(frequencyFiltered, columnsToDrop);
        
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