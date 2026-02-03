/**
 * Client-side background removal for preview
 * Removes simple backgrounds like solid colors using canvas processing
 */
const BackgroundRemover = (() => {
    /**
     * Remove background from an image (data URL or Image element)
     * @param {string|HTMLImageElement} imageSource - Image data URL or Image element
     * @param {Object} options - Processing options
     * @returns {Promise<string>} - Data URL of processed image
     */
    async function removeBackground(imageSource, options = {}) {
        const {
            tolerance = 20,      // Color tolerance (0-255)
            featherRadius = 3,   // Feathering radius in pixels
            edgeDetection = true // Enable edge detection
        } = options;

        // Create canvas and load image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        let img;
        if (typeof imageSource === 'string') {
            img = await loadImage(imageSource);
        } else {
            img = imageSource;
        }

        canvas.width = img.width;
        canvas.height = img.height;

        // Draw image to canvas
        ctx.drawImage(img, 0, 0);

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Sample corner colors to detect background
        const corners = [
            getPixel(data, canvas.width, 0, 0),                                    // Top-left
            getPixel(data, canvas.width, canvas.width - 1, 0),                    // Top-right
            getPixel(data, canvas.width, 0, canvas.height - 1),                   // Bottom-left
            getPixel(data, canvas.width, canvas.width - 1, canvas.height - 1)    // Bottom-right
        ];

        // Find most common corner color (likely background)
        const bgColor = getMostCommonColor(corners);

        // Create alpha mask
        const alphaMask = new Uint8Array(canvas.width * canvas.height);

        // Flood fill from edges to mark background pixels
        floodFillFromEdges(data, alphaMask, canvas.width, canvas.height, bgColor, tolerance);

        // Apply edge detection to refine mask
        if (edgeDetection) {
            refineWithEdges(data, alphaMask, canvas.width, canvas.height);
        }

        // Apply feathering to smooth edges
        if (featherRadius > 0) {
            featherMask(alphaMask, canvas.width, canvas.height, featherRadius);
        }

        // Apply alpha mask to image
        for (let i = 0; i < alphaMask.length; i++) {
            data[i * 4 + 3] = alphaMask[i]; // Set alpha channel
        }

        // Put processed image back
        ctx.putImageData(imageData, 0, 0);

        // Return as data URL
        return canvas.toDataURL('image/png');
    }

    /**
     * Load image from data URL
     */
    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    /**
     * Get pixel color at position
     */
    function getPixel(data, width, x, y) {
        const idx = (y * width + x) * 4;
        return {
            r: data[idx],
            g: data[idx + 1],
            b: data[idx + 2],
            a: data[idx + 3]
        };
    }

    /**
     * Calculate color distance
     */
    function colorDistance(c1, c2) {
        const dr = c1.r - c2.r;
        const dg = c1.g - c2.g;
        const db = c1.b - c2.b;
        return Math.sqrt(dr * dr + dg * dg + db * db);
    }

    /**
     * Find most common color among corners
     */
    function getMostCommonColor(colors) {
        // Group similar colors
        const groups = [];
        for (const color of colors) {
            let found = false;
            for (const group of groups) {
                if (colorDistance(color, group.color) < 30) {
                    group.count++;
                    found = true;
                    break;
                }
            }
            if (!found) {
                groups.push({ color, count: 1 });
            }
        }

        // Return most common
        groups.sort((a, b) => b.count - a.count);
        return groups[0].color;
    }

    /**
     * Flood fill from all edges to mark background pixels
     */
    function floodFillFromEdges(data, mask, width, height, bgColor, tolerance) {
        // Initialize mask with full opacity
        mask.fill(255);

        // Mark pixels similar to background color
        const visited = new Uint8Array(width * height);
        const queue = [];

        // Add all edge pixels to queue
        for (let x = 0; x < width; x++) {
            addToQueue(queue, visited, x, 0, width, height);                  // Top edge
            addToQueue(queue, visited, x, height - 1, width, height);         // Bottom edge
        }
        for (let y = 0; y < height; y++) {
            addToQueue(queue, visited, 0, y, width, height);                  // Left edge
            addToQueue(queue, visited, width - 1, y, width, height);          // Right edge
        }

        // Flood fill
        while (queue.length > 0) {
            const { x, y } = queue.shift();
            const idx = y * width + x;
            const pixel = getPixel(data, width, x, y);

            // Check if pixel is similar to background
            if (colorDistance(pixel, bgColor) <= tolerance) {
                mask[idx] = 0; // Mark as transparent

                // Add neighbors
                if (x > 0) addToQueue(queue, visited, x - 1, y, width, height);
                if (x < width - 1) addToQueue(queue, visited, x + 1, y, width, height);
                if (y > 0) addToQueue(queue, visited, x, y - 1, width, height);
                if (y < height - 1) addToQueue(queue, visited, x, y + 1, width, height);
            }
        }
    }

    /**
     * Add position to queue if not visited
     */
    function addToQueue(queue, visited, x, y, width, height) {
        const idx = y * width + x;
        if (!visited[idx]) {
            visited[idx] = 1;
            queue.push({ x, y });
        }
    }

    /**
     * Refine mask using edge detection
     */
    function refineWithEdges(data, mask, width, height) {
        const edges = detectEdges(data, width, height);

        // Keep pixels near edges
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;
                if (edges[idx] > 50) { // Strong edge
                    // Keep this pixel and nearby pixels
                    mask[idx] = 255;
                    if (x > 0) mask[idx - 1] = Math.max(mask[idx - 1], 200);
                    if (x < width - 1) mask[idx + 1] = Math.max(mask[idx + 1], 200);
                    if (y > 0) mask[idx - width] = Math.max(mask[idx - width], 200);
                    if (y < height - 1) mask[idx + width] = Math.max(mask[idx + width], 200);
                }
            }
        }
    }

    /**
     * Detect edges using Sobel operator
     */
    function detectEdges(data, width, height) {
        const edges = new Uint8Array(width * height);

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                // Sobel kernels
                const gx =
                    -1 * getGray(data, width, x - 1, y - 1) +
                    1 * getGray(data, width, x + 1, y - 1) +
                    -2 * getGray(data, width, x - 1, y) +
                    2 * getGray(data, width, x + 1, y) +
                    -1 * getGray(data, width, x - 1, y + 1) +
                    1 * getGray(data, width, x + 1, y + 1);

                const gy =
                    -1 * getGray(data, width, x - 1, y - 1) +
                    -2 * getGray(data, width, x, y - 1) +
                    -1 * getGray(data, width, x + 1, y - 1) +
                    1 * getGray(data, width, x - 1, y + 1) +
                    2 * getGray(data, width, x, y + 1) +
                    1 * getGray(data, width, x + 1, y + 1);

                const magnitude = Math.sqrt(gx * gx + gy * gy);
                edges[y * width + x] = Math.min(255, magnitude);
            }
        }

        return edges;
    }

    /**
     * Get grayscale value of pixel
     */
    function getGray(data, width, x, y) {
        const idx = (y * width + x) * 4;
        return (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
    }

    /**
     * Apply feathering (blur) to mask
     */
    function featherMask(mask, width, height, radius) {
        const temp = new Uint8Array(mask.length);
        const kernel = createGaussianKernel(radius);
        const kernelSize = kernel.length;
        const half = Math.floor(kernelSize / 2);

        // Horizontal pass
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0;
                let weightSum = 0;

                for (let kx = 0; kx < kernelSize; kx++) {
                    const sampleX = x + kx - half;
                    if (sampleX >= 0 && sampleX < width) {
                        const idx = y * width + sampleX;
                        sum += mask[idx] * kernel[kx];
                        weightSum += kernel[kx];
                    }
                }

                temp[y * width + x] = sum / weightSum;
            }
        }

        // Vertical pass
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0;
                let weightSum = 0;

                for (let ky = 0; ky < kernelSize; ky++) {
                    const sampleY = y + ky - half;
                    if (sampleY >= 0 && sampleY < height) {
                        const idx = sampleY * width + x;
                        sum += temp[idx] * kernel[ky];
                        weightSum += kernel[ky];
                    }
                }

                mask[y * width + x] = sum / weightSum;
            }
        }
    }

    /**
     * Create Gaussian kernel for blurring
     */
    function createGaussianKernel(radius) {
        const size = radius * 2 + 1;
        const kernel = new Float32Array(size);
        const sigma = radius / 2;
        let sum = 0;

        for (let i = 0; i < size; i++) {
            const x = i - radius;
            kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
            sum += kernel[i];
        }

        // Normalize
        for (let i = 0; i < size; i++) {
            kernel[i] /= sum;
        }

        return kernel;
    }

    return { removeBackground };
})();

// Export to window
window.BackgroundRemover = BackgroundRemover;
