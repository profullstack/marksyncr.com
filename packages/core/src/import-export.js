/**
 * @fileoverview Import/Export module for bookmark data
 * Free users: HTML and JSON import/export
 * Pro users: Additional formats (Pocket, Raindrop, Pinboard, CSV, Markdown)
 */

/**
 * Supported import formats
 */
export const IMPORT_FORMATS = {
  NETSCAPE_HTML: 'netscape_html',
  JSON: 'json',
  POCKET: 'pocket',
  RAINDROP: 'raindrop',
  PINBOARD: 'pinboard',
  CSV: 'csv',
};

/**
 * Supported export formats
 */
export const EXPORT_FORMATS = {
  HTML: 'html',
  JSON: 'json',
  CSV: 'csv',
  MARKDOWN: 'markdown',
};

/**
 * Generate a unique ID for imported bookmarks
 * @returns {string} Unique ID
 */
const generateId = () => {
  return `import-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

/**
 * Parse Unix timestamp to Date
 * @param {number|string} timestamp - Unix timestamp (seconds or milliseconds)
 * @returns {number} Timestamp in milliseconds
 */
const parseTimestamp = (timestamp) => {
  if (!timestamp) return Date.now();
  const ts = parseInt(timestamp, 10);
  // If timestamp is in seconds (less than year 3000 in seconds)
  if (ts < 32503680000) {
    return ts * 1000;
  }
  return ts;
};

/**
 * Escape HTML entities
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
const escapeHtml = (str) => {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/**
 * Escape CSV value
 * @param {string} value - Value to escape
 * @returns {string} Escaped value
 */
const escapeCsvValue = (value) => {
  if (!value) return '""';
  const escaped = String(value).replace(/"/g, '""');
  return `"${escaped}"`;
};

// ============================================
// Import Parsers
// ============================================

/**
 * Parse Netscape HTML bookmark file (standard browser export format)
 * @param {string} html - HTML content
 * @returns {Object} Parsed bookmark data
 */
export function parseNetscapeHtml(html) {
  const bookmarks = [];
  let totalCount = 0;

  // Simple regex-based parser for Netscape bookmark format
  const parseFolder = (content, depth = 0) => {
    const items = [];
    
    // Match folder headers and their content
    const folderRegex = /<DT><H3[^>]*>([^<]*)<\/H3>\s*<DL><p>([\s\S]*?)<\/DL><p>/gi;
    // Match individual bookmarks
    const bookmarkRegex = /<DT><A\s+HREF="([^"]*)"[^>]*(?:ADD_DATE="(\d*)")?[^>]*>([^<]*)<\/A>/gi;

    let match;
    let lastIndex = 0;
    let processedContent = content;

    // First, extract all folders
    const folders = [];
    while ((match = folderRegex.exec(content)) !== null) {
      folders.push({
        title: match[1],
        content: match[2],
        index: match.index,
        length: match[0].length,
      });
    }

    // Process bookmarks before first folder
    const beforeFirstFolder = folders.length > 0 
      ? content.slice(0, folders[0].index) 
      : content;

    while ((match = bookmarkRegex.exec(beforeFirstFolder)) !== null) {
      totalCount++;
      items.push({
        id: generateId(),
        title: match[3] || 'Untitled',
        url: match[1],
        type: 'bookmark',
        dateAdded: parseTimestamp(match[2]),
      });
    }

    // Process each folder
    for (const folder of folders) {
      const children = parseFolder(folder.content, depth + 1);
      totalCount++;
      items.push({
        id: generateId(),
        title: folder.title || 'Untitled Folder',
        type: 'folder',
        children,
        dateAdded: Date.now(),
      });
    }

    // Process bookmarks after folders (between folders)
    // Reset regex
    bookmarkRegex.lastIndex = 0;
    
    // Find bookmarks not inside folders
    const outsideFolderContent = content.replace(/<DL><p>[\s\S]*?<\/DL><p>/gi, '');
    while ((match = bookmarkRegex.exec(outsideFolderContent)) !== null) {
      // Check if this bookmark was already added
      const exists = items.some(item => item.url === match[1] && item.title === match[3]);
      if (!exists) {
        totalCount++;
        items.push({
          id: generateId(),
          title: match[3] || 'Untitled',
          url: match[1],
          type: 'bookmark',
          dateAdded: parseTimestamp(match[2]),
        });
      }
    }

    return items;
  };

  // Extract main content
  const mainDlMatch = html.match(/<DL><p>([\s\S]*)<\/DL><p>/i);
  if (mainDlMatch) {
    bookmarks.push(...parseFolder(mainDlMatch[1]));
  }

  return {
    format: IMPORT_FORMATS.NETSCAPE_HTML,
    bookmarks,
    totalCount,
    importedAt: new Date().toISOString(),
  };
}

/**
 * Parse Pocket HTML export
 * @param {string} html - HTML content
 * @returns {Object} Parsed bookmark data
 */
export function parsePocketExport(html) {
  const bookmarks = [];
  let totalCount = 0;

  // Pocket exports have sections like "Unread" and "Read Archive"
  const sectionRegex = /<h1>([^<]+)<\/h1>\s*<ul>([\s\S]*?)<\/ul>/gi;
  const linkRegex = /<a\s+href="([^"]+)"[^>]*(?:time_added="(\d+)")?[^>]*>([^<]*)<\/a>/gi;

  let sectionMatch;
  while ((sectionMatch = sectionRegex.exec(html)) !== null) {
    const sectionTitle = sectionMatch[1];
    const sectionContent = sectionMatch[2];
    const children = [];

    let linkMatch;
    while ((linkMatch = linkRegex.exec(sectionContent)) !== null) {
      totalCount++;
      children.push({
        id: generateId(),
        title: linkMatch[3] || 'Untitled',
        url: linkMatch[1],
        type: 'bookmark',
        dateAdded: parseTimestamp(linkMatch[2]),
      });
    }

    if (children.length > 0) {
      bookmarks.push({
        id: generateId(),
        title: sectionTitle,
        type: 'folder',
        children,
        dateAdded: Date.now(),
      });
    }
  }

  return {
    format: IMPORT_FORMATS.POCKET,
    bookmarks,
    totalCount,
    importedAt: new Date().toISOString(),
  };
}

/**
 * Parse Raindrop.io JSON export
 * @param {string} jsonString - JSON content
 * @returns {Object} Parsed bookmark data
 */
export function parseRaindropExport(jsonString) {
  const data = JSON.parse(jsonString);
  const bookmarks = [];
  let totalCount = 0;

  // Group by collection
  const collections = new Map();

  for (const item of data.items || []) {
    const collectionTitle = item.collection?.title || 'Unsorted';
    
    if (!collections.has(collectionTitle)) {
      collections.set(collectionTitle, []);
    }

    totalCount++;
    collections.get(collectionTitle).push({
      id: generateId(),
      title: item.title || 'Untitled',
      url: item.link,
      type: 'bookmark',
      tags: item.tags || [],
      notes: item.note || '',
      dateAdded: item.created ? new Date(item.created).getTime() : Date.now(),
    });
  }

  // Convert collections to folder structure
  for (const [title, items] of collections) {
    bookmarks.push({
      id: generateId(),
      title,
      type: 'folder',
      children: items,
      dateAdded: Date.now(),
    });
  }

  return {
    format: IMPORT_FORMATS.RAINDROP,
    bookmarks,
    totalCount,
    importedAt: new Date().toISOString(),
  };
}

/**
 * Parse Pinboard JSON export
 * @param {string} jsonString - JSON content
 * @returns {Object} Parsed bookmark data
 */
export function parsePinboardJson(jsonString) {
  const data = JSON.parse(jsonString);
  const bookmarks = [];

  for (const item of data) {
    const tags = item.tags ? item.tags.split(' ').filter(Boolean) : [];
    
    bookmarks.push({
      id: generateId(),
      title: item.description || 'Untitled',
      url: item.href,
      type: 'bookmark',
      tags,
      notes: item.extended || '',
      dateAdded: item.time ? new Date(item.time).getTime() : Date.now(),
      toRead: item.toread === 'yes',
    });
  }

  return {
    format: IMPORT_FORMATS.PINBOARD,
    bookmarks,
    totalCount: bookmarks.length,
    importedAt: new Date().toISOString(),
  };
}

/**
 * Parse MarkSyncr JSON export (same format as GitHub repo sync)
 * @param {string} jsonString - JSON content
 * @returns {Object} Parsed bookmark data
 */
export function parseMarkSyncrJson(jsonString) {
  const data = JSON.parse(jsonString);
  
  // Handle MarkSyncr export format
  if (data.source === 'MarkSyncr' || data.version) {
    const bookmarks = data.bookmarks || [];
    
    // Count total bookmarks
    const countBookmarks = (items) => {
      let count = 0;
      for (const item of items) {
        if (item.type === 'folder' || item.children) {
          count += countBookmarks(item.children || []);
        } else {
          count++;
        }
      }
      return count;
    };
    
    return {
      format: IMPORT_FORMATS.JSON,
      bookmarks,
      totalCount: countBookmarks(bookmarks),
      importedAt: new Date().toISOString(),
    };
  }
  
  // Handle generic JSON array of bookmarks
  if (Array.isArray(data)) {
    const bookmarks = data.map(item => ({
      id: generateId(),
      title: item.title || 'Untitled',
      url: item.url || item.href || item.link,
      type: item.type || 'bookmark',
      tags: item.tags || [],
      notes: item.notes || item.description || '',
      dateAdded: item.dateAdded || item.created || Date.now(),
      children: item.children,
    }));
    
    return {
      format: IMPORT_FORMATS.JSON,
      bookmarks,
      totalCount: bookmarks.length,
      importedAt: new Date().toISOString(),
    };
  }
  
  throw new Error('Invalid JSON bookmark format');
}

/**
 * Parse CSV bookmark file
 * @param {string} csvContent - CSV content
 * @returns {Object} Parsed bookmark data
 */
export function parseCsv(csvContent) {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    return {
      format: IMPORT_FORMATS.CSV,
      bookmarks: [],
      totalCount: 0,
      importedAt: new Date().toISOString(),
    };
  }

  // Parse header
  const header = parseCSVLine(lines[0]);
  const titleIndex = header.findIndex((h) => h.toLowerCase() === 'title');
  const urlIndex = header.findIndex((h) => h.toLowerCase() === 'url');
  const folderIndex = header.findIndex((h) => h.toLowerCase() === 'folder');
  const tagsIndex = header.findIndex((h) => h.toLowerCase() === 'tags');
  const notesIndex = header.findIndex((h) => h.toLowerCase() === 'notes');

  const bookmarks = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const title = titleIndex >= 0 ? values[titleIndex] : '';
    const url = urlIndex >= 0 ? values[urlIndex] : '';
    
    if (!url) continue;

    const tags = tagsIndex >= 0 && values[tagsIndex]
      ? values[tagsIndex].split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    bookmarks.push({
      id: generateId(),
      title: title || 'Untitled',
      url,
      type: 'bookmark',
      folder: folderIndex >= 0 ? values[folderIndex] : '',
      tags,
      notes: notesIndex >= 0 ? values[notesIndex] : '',
      dateAdded: Date.now(),
    });
  }

  return {
    format: IMPORT_FORMATS.CSV,
    bookmarks,
    totalCount: bookmarks.length,
    importedAt: new Date().toISOString(),
  };
}

/**
 * Parse a single CSV line handling quoted values
 * @param {string} line - CSV line
 * @returns {Array} Parsed values
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

// ============================================
// Export Formatters
// ============================================

/**
 * Format bookmarks to Netscape HTML format
 * @param {Array} bookmarks - Bookmarks array
 * @returns {string} HTML content
 */
export function formatToNetscapeHtml(bookmarks) {
  const formatItem = (item, indent = '    ') => {
    if (item.type === 'folder' || item.children) {
      const children = (item.children || [])
        .map((child) => formatItem(child, indent + '    '))
        .join('\n');
      
      return `${indent}<DT><H3 ADD_DATE="${Math.floor((item.dateAdded || Date.now()) / 1000)}">${escapeHtml(item.title)}</H3>
${indent}<DL><p>
${children}
${indent}</DL><p>`;
    }

    const addDate = item.dateAdded 
      ? ` ADD_DATE="${Math.floor(item.dateAdded / 1000)}"` 
      : '';
    
    return `${indent}<DT><A HREF="${escapeHtml(item.url)}"${addDate}>${escapeHtml(item.title)}</A>`;
  };

  const content = bookmarks.map((b) => formatItem(b)).join('\n');

  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${content}
</DL><p>`;
}

/**
 * Format bookmarks to JSON
 * @param {Array} bookmarks - Bookmarks array
 * @returns {string} JSON content
 */
export function formatToJson(bookmarks) {
  return JSON.stringify({
    version: '1.1',
    source: 'MarkSyncr',
    exportedAt: new Date().toISOString(),
    bookmarks,
  }, null, 2);
}

/**
 * Format bookmarks to CSV
 * @param {Array} bookmarks - Bookmarks array
 * @returns {string} CSV content
 */
export function formatToCsv(bookmarks) {
  const rows = ['title,url,folder,tags,notes,dateAdded'];

  const flattenBookmarks = (items, folderPath = '') => {
    for (const item of items) {
      if (item.type === 'folder' || item.children) {
        const newPath = folderPath ? `${folderPath}/${item.title}` : item.title;
        flattenBookmarks(item.children || [], newPath);
      } else {
        const tags = (item.tags || [])
          .map((t) => (typeof t === 'string' ? t : t.name))
          .join(',');
        
        rows.push([
          escapeCsvValue(item.title),
          escapeCsvValue(item.url),
          escapeCsvValue(folderPath),
          escapeCsvValue(tags),
          escapeCsvValue(item.notes || ''),
          escapeCsvValue(item.dateAdded ? new Date(item.dateAdded).toISOString() : ''),
        ].join(','));
      }
    }
  };

  flattenBookmarks(bookmarks);
  return rows.join('\n');
}

/**
 * Format bookmarks to Markdown
 * @param {Array} bookmarks - Bookmarks array
 * @returns {string} Markdown content
 */
export function formatToMarkdown(bookmarks) {
  const lines = ['# Bookmarks', '', `*Exported from MarkSyncr on ${new Date().toLocaleDateString()}*`, ''];

  const formatItem = (item, level = 2) => {
    if (item.type === 'folder' || item.children) {
      const heading = '#'.repeat(Math.min(level, 6));
      lines.push(`${heading} ${item.title}`, '');
      
      for (const child of item.children || []) {
        formatItem(child, level + 1);
      }
    } else {
      lines.push(`- [${item.title}](${item.url})`);
      
      if (item.tags && item.tags.length > 0) {
        const tagStr = item.tags
          .map((t) => `\`${typeof t === 'string' ? t : t.name}\``)
          .join(' ');
        lines.push(`  Tags: ${tagStr}`);
      }
      
      if (item.notes) {
        lines.push(`  > ${item.notes}`);
      }
      
      lines.push('');
    }
  };

  for (const bookmark of bookmarks) {
    formatItem(bookmark);
  }

  return lines.join('\n');
}

// ============================================
// Utilities
// ============================================

/**
 * Detect import format from content
 * @param {string} content - File content
 * @returns {string|null} Detected format or null
 */
export function detectImportFormat(content) {
  const trimmed = content.trim();

  // Check for Netscape HTML
  if (trimmed.includes('<!DOCTYPE NETSCAPE-Bookmark-file-1>') ||
      trimmed.includes('NETSCAPE-Bookmark-file')) {
    return IMPORT_FORMATS.NETSCAPE_HTML;
  }

  // Check for Pocket export (has specific structure)
  if (trimmed.includes('<h1>Unread</h1>') || trimmed.includes('<h1>Read Archive</h1>')) {
    return IMPORT_FORMATS.POCKET;
  }

  // Try to parse as JSON
  try {
    const data = JSON.parse(trimmed);
    
    // MarkSyncr JSON format (has source or version)
    if (data.source === 'MarkSyncr' || (data.version && data.bookmarks)) {
      return IMPORT_FORMATS.JSON;
    }
    
    // Raindrop format has 'items' array
    if (data.items && Array.isArray(data.items)) {
      return IMPORT_FORMATS.RAINDROP;
    }
    
    // Pinboard format is array of objects with 'href'
    if (Array.isArray(data) && data.length > 0 && data[0].href) {
      return IMPORT_FORMATS.PINBOARD;
    }
    
    // Generic JSON array with url property (not Pinboard)
    if (Array.isArray(data) && data.length > 0 && (data[0].url || data[0].link)) {
      return IMPORT_FORMATS.JSON;
    }
    
    // Object with bookmarks array
    if (data.bookmarks && Array.isArray(data.bookmarks)) {
      return IMPORT_FORMATS.JSON;
    }
  } catch {
    // Not JSON
  }

  // Check for CSV (has header row with common column names)
  const firstLine = trimmed.split('\n')[0].toLowerCase();
  if (firstLine.includes('title') && firstLine.includes('url')) {
    return IMPORT_FORMATS.CSV;
  }

  return null;
}

/**
 * Validate imported bookmark data
 * @param {Object} data - Imported data
 * @returns {Object} Validation result
 */
export function validateImportData(data) {
  const errors = [];

  if (!data.bookmarks || !Array.isArray(data.bookmarks)) {
    errors.push('Missing bookmarks array');
    return { valid: false, errors };
  }

  const validateBookmark = (bookmark, path = '') => {
    const itemPath = path ? `${path} > ${bookmark.title}` : bookmark.title;

    // Folders don't need URLs
    if (bookmark.type === 'folder' || bookmark.children) {
      if (bookmark.children) {
        for (const child of bookmark.children) {
          validateBookmark(child, itemPath);
        }
      }
      return;
    }

    // Bookmarks need URLs
    if (!bookmark.url) {
      errors.push(`Bookmark "${itemPath}" is missing URL`);
    }
  };

  for (const bookmark of data.bookmarks) {
    validateBookmark(bookmark);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Parse import file based on detected or specified format
 * @param {string} content - File content
 * @param {string} [format] - Optional format override
 * @returns {Object} Parsed bookmark data
 */
export function parseImportFile(content, format = null) {
  const detectedFormat = format || detectImportFormat(content);

  if (!detectedFormat) {
    throw new Error('Unable to detect import format');
  }

  switch (detectedFormat) {
    case IMPORT_FORMATS.NETSCAPE_HTML:
      return parseNetscapeHtml(content);
    case IMPORT_FORMATS.JSON:
      return parseMarkSyncrJson(content);
    case IMPORT_FORMATS.POCKET:
      return parsePocketExport(content);
    case IMPORT_FORMATS.RAINDROP:
      return parseRaindropExport(content);
    case IMPORT_FORMATS.PINBOARD:
      return parsePinboardJson(content);
    case IMPORT_FORMATS.CSV:
      return parseCsv(content);
    default:
      throw new Error(`Unsupported import format: ${detectedFormat}`);
  }
}

/**
 * Export bookmarks to specified format
 * @param {Array} bookmarks - Bookmarks array
 * @param {string} format - Export format
 * @returns {string} Formatted content
 */
export function exportBookmarks(bookmarks, format) {
  switch (format) {
    case EXPORT_FORMATS.HTML:
      return formatToNetscapeHtml(bookmarks);
    case EXPORT_FORMATS.JSON:
      return formatToJson(bookmarks);
    case EXPORT_FORMATS.CSV:
      return formatToCsv(bookmarks);
    case EXPORT_FORMATS.MARKDOWN:
      return formatToMarkdown(bookmarks);
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

export default {
  IMPORT_FORMATS,
  EXPORT_FORMATS,
  parseNetscapeHtml,
  parseMarkSyncrJson,
  parsePocketExport,
  parseRaindropExport,
  parsePinboardJson,
  parseCsv,
  formatToNetscapeHtml,
  formatToJson,
  formatToCsv,
  formatToMarkdown,
  detectImportFormat,
  validateImportData,
  parseImportFile,
  exportBookmarks,
};
