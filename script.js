document.addEventListener('DOMContentLoaded', () => {
    
    const selectFilesBtn = document.getElementById('select-files-btn');
    const selectFilesInput = document.getElementById('select-files-input');
    const selectFolderBtn = document.getElementById('select-folder-btn');
    const clearTableBtn = document.getElementById('clear-table-btn');
    const tableBody = document.querySelector('#image-info-table tbody');
    const imagesContainer = document.querySelector('.images-container');
    const uploadText = document.querySelector('.upload-images-p');
    

    let processedCount = 0;
    let totalCount = 0;
    
    selectFilesBtn.addEventListener('click', () => selectFilesInput.click());
    

    selectFilesInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            handleFiles(files);
        }
        e.target.value = ''; 
    });
    

    selectFolderBtn.addEventListener('click', selectFolder);
    clearTableBtn.addEventListener('click', clearTable);
    
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        imagesContainer.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });
    

    imagesContainer.addEventListener('dragenter', () => {
        imagesContainer.style.backgroundColor = '#e8f4ff';
    });
    
    imagesContainer.addEventListener('dragleave', () => {
        imagesContainer.style.backgroundColor = '';
    });
    

    imagesContainer.addEventListener('drop', async (e) => {
        imagesContainer.style.backgroundColor = '';
        
        const items = e.dataTransfer.items;
        const files = [];
        
        if (items && items.length > 0) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                
                if (item.kind === 'file') {
                    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : item.getAsEntry();
                    
                    if (entry) {
                        const extractedFiles = await traverseFileTree(entry);
                        files.push(...extractedFiles);
                    } else {
                        const file = item.getAsFile();
                        if (file && isImageFile(file)) {
                            files.push(file);
                        }
                    }
                }
            }
        } else {
            const droppedFiles = Array.from(e.dataTransfer.files);
            files.push(...droppedFiles.filter(isImageFile));
        }
        
        if (files.length > 0) {
            handleFiles(files);
        }
    });
    

    async function traverseFileTree(entry) {
        const files = [];
        
        if (entry.isFile) {
            return new Promise((resolve) => {
                entry.file(
                    (file) => {
                        if (isImageFile(file)) {
                            resolve([file]);
                        } else {
                            resolve([]);
                        }
                    },
                    (error) => {
                        console.error('Error reading file:', error);
                        resolve([]);
                    }
                );
            });
        } else if (entry.isDirectory) {
            const dirReader = entry.createReader();
            const entries = await readAllDirectoryEntries(dirReader);
            
            for (const childEntry of entries) {
                const childFiles = await traverseFileTree(childEntry);
                files.push(...childFiles);
            }
        }
        
        return files;
    }
    

    function readAllDirectoryEntries(dirReader) {
        return new Promise((resolve) => {
            const entries = [];
            
            function readEntries() {
                dirReader.readEntries(
                    (batch) => {
                        if (batch.length > 0) {
                            entries.push(...batch);
                            readEntries(); 
                        } else {
                            resolve(entries);
                        }
                    },
                    (error) => {
                        console.error('Error reading directory:', error);
                        resolve(entries);
                    }
                );
            }
            
            readEntries();
        });
    }
    
    async function selectFolder() {
        try {
            if (!window.showDirectoryPicker) {
                alert('Your browser does not support folder selection. Use Chrome or Edge.');
                return;
            }
            
            const dirHandle = await window.showDirectoryPicker();
            const files = [];
            
            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'file') {
                    const file = await entry.getFile();
                    if (isImageFile(file)) {
                        files.push(file);
                    }
                }
            }
            
            if (files.length > 0) {
                handleFiles(files);
            } else {
                alert('No image files found in folder');
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error(err);
            }
        }
    }
    
    function isImageFile(file) {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp'];
        const fileName = file.name.toLowerCase();
        return imageExtensions.some(ext => fileName.endsWith(ext));
    }
    
    async function handleFiles(files) {
        clearTable();
        totalCount = files.length;
        processedCount = 0;
        
        uploadText.textContent = 'Processing...';
        
        for (const file of files) {
            await processImage(file);
            processedCount++;
            uploadText.textContent = `Processed: ${processedCount} / ${totalCount}`;
        }
        
        uploadText.textContent = `Complete! Processed ${totalCount} images`;
        
        setTimeout(() => {
            uploadText.textContent = 'Upload JPG Images';
        }, 3000);
    }
    

    async function processImage(file) {
        const info = {
            name: file.name,
            width: 0,
            height: 0,
            dpi: 72,
            colorDepth: 24,
            compression: 'N/A'
        };
        
        try {
            //через Image API
            const dimensions = await getImageDimensions(file);
            info.width = dimensions.width;
            info.height = dimensions.height;
            
            const ext = file.name.toLowerCase().split('.').pop();
            
            switch(ext) {
                case 'jpg':
                case 'jpeg':
                    info.compression = 'JPEG';
                    const exifData = await getExifData(file);
                    if (exifData.dpi) info.dpi = exifData.dpi;
                    if (exifData.colorDepth) info.colorDepth = exifData.colorDepth;
                    break;
                case 'png':
                    info.compression = 'PNG';
                    info.colorDepth = 32;
                    break;
                case 'gif':
                    info.compression = 'GIF';
                    info.colorDepth = 8;
                    break;
                case 'bmp':
                    info.compression = 'BMP';
                    break;
                case 'webp':
                    info.compression = 'WebP';
                    break;
                case 'tif':
                case 'tiff':
                    info.compression = 'TIFF';
                    break;
            }
        } catch (error) {
            console.error(`Error processing ${file.name}:`, error);
        }
        
        addTableRow(info);
    }
    
    function getImageDimensions(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve({
                    width: img.naturalWidth,
                    height: img.naturalHeight
                });
            };
            
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load image'));
            };
            
            img.src = url;
        });
    }
    
    function getExifData(file) {
        return new Promise((resolve) => {
            if (typeof EXIF === 'undefined') {
                resolve({});
                return;
            }
            
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const img = new Image();
                
                img.onload = function() {
                    EXIF.getData(img, function() {
                        const result = {};
                        
                        const xResolution = EXIF.getTag(this, "XResolution");
                        if (xResolution && xResolution.numerator) {
                            result.dpi = Math.round(xResolution.numerator / (xResolution.denominator || 1));
                        }
                        
                        const bitsPerSample = EXIF.getTag(this, "BitsPerSample");
                        if (bitsPerSample) {
                            if (Array.isArray(bitsPerSample)) {
                                result.colorDepth = bitsPerSample.reduce((a, b) => a + b, 0);
                            } else {
                                result.colorDepth = bitsPerSample;
                            }
                        }
                        
                        resolve(result);
                    });
                };
                
                img.onerror = () => resolve({});
                img.src = e.target.result;
            };
            
            reader.onerror = () => resolve({});
            reader.readAsDataURL(file);
        });
    }
    
    function addTableRow(info) {
        const row = tableBody.insertRow();
        row.innerHTML = `
            <td>${info.name}</td>
            <td>${info.width} × ${info.height}</td>
            <td>${info.dpi}</td>
            <td>${info.colorDepth}</td>
            <td>${info.compression}</td>
        `;
    }
    
    function clearTable() {
        tableBody.innerHTML = '';
        processedCount = 0;
        totalCount = 0;
    }
});