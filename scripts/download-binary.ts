#!/usr/bin/env node

import { get } from 'https';
import { existsSync, mkdirSync, createWriteStream, unlinkSync, chmodSync, writeFileSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { platform as _platform, arch as _arch } from 'os';
import type { IncomingMessage } from 'http';

export const KEEP_SORTED_VERSION = 'v0.7.1';
const REPO = 'google/keep-sorted';
const binDir = join(__dirname, '..', 'bin');

interface PlatformInfo {
    asset: string;
    filename: string;
    platform: string;
    arch: string;
    isSupported: boolean;
}

interface PlatformMapping {
    [key: string]: {
        asset: string;
        filename: string;
    };
}

// Available binaries from keep-sorted releases
const PLATFORM_MAPPING: PlatformMapping = {
    'win32': { asset: 'keep-sorted_windows.exe', filename: 'keep-sorted.exe' },
    'darwin': { asset: 'keep-sorted_darwin', filename: 'keep-sorted' },
    'linux': { asset: 'keep-sorted_linux', filename: 'keep-sorted' }
};

// Ensure bin directory exists
if (!existsSync(binDir)) {
    mkdirSync(binDir, { recursive: true });
}

function getPlatformInfo(): PlatformInfo {
    const platform = _platform();
    const arch = _arch();
    
    const platformInfo = PLATFORM_MAPPING[platform];
    if (!platformInfo) {
        console.warn(`Unsupported platform: ${platform}. Falling back to linux binary.`);
        return { 
            ...PLATFORM_MAPPING.linux, 
            platform, 
            arch, 
            isSupported: false 
        };
    }
    
    // Warn about architecture limitations
    if (arch === 'arm64' && platform !== 'darwin') {
        console.warn(`ARM64 architecture detected on ${platform}. The x64 binary may not work.`);
    } else if (arch !== 'x64' && arch !== 'arm64') {
        console.warn(`Architecture ${arch} may not be compatible. The x64 binary may not work.`);
    }
    
    return { 
        ...platformInfo, 
        platform, 
        arch, 
        isSupported: platform in PLATFORM_MAPPING && (arch === 'x64' || (arch === 'arm64' && platform === 'darwin'))
    };
}

class DownloadError extends Error {
    constructor(
        message: string,
        public readonly url: string,
        public readonly statusCode?: number,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'DownloadError';
    }
}

async function downloadFile(url: string, dest: string): Promise<void> {
    const tempDest = `${dest}.download`;
    
    try {
        console.log(`Downloading ${basename(dest)}...`);
        
        await new Promise<void>((resolve, reject) => {
            const file = createWriteStream(tempDest);
            
            const handleResponse = (response: IncomingMessage): void => {
                if (response.statusCode === undefined) {
                    reject(new DownloadError('No status code in response', url));
                    return;
                }

                if (response.statusCode === 404) {
                    reject(new DownloadError('Binary not found', url, response.statusCode));
                    return;
                }

                if (response.statusCode >= 400) {
                    reject(new DownloadError(`HTTP error ${response.statusCode}`, url, response.statusCode));
                    return;
                }

                response.pipe(file);
            };
            
            const request = get(url, (response: IncomingMessage) => {
                if (response.statusCode === 302 && response.headers.location) {
                    // Handle GitHub redirect
                    get(response.headers.location, handleResponse)
                        .on('error', (err) => {
                            reject(new DownloadError('Redirect failed', url, undefined, err));
                        });
                } else {
                    handleResponse(response);
                }
            });
            
            file.on('finish', () => {
                file.close();
                resolve();
            });
            
            request.on('error', (err) => {
                reject(new DownloadError('Request failed', url, undefined, err));
            });
            
            file.on('error', (err) => {
                reject(new DownloadError('File write failed', url, undefined, err));
            });
        });

        // Only move the file if download was successful
        if (existsSync(dest)) {
            unlinkSync(dest);
        }
        writeFileSync(dest, readFileSync(tempDest));
        unlinkSync(tempDest);
        
    } catch (error) {
        // Clean up temp file on error
        if (existsSync(tempDest)) {
            try {
                unlinkSync(tempDest);
            } catch (cleanupError) {
                console.warn('Failed to clean up temporary file:', cleanupError instanceof Error ? cleanupError.message : 'Unknown error');
            }
        }
        throw error;
    }
}

async function downloadBinary(platform: PlatformInfo): Promise<void> {
    const { asset, filename } = platform;
    const binaryPath = join(binDir, filename);
    const url = `https://github.com/${REPO}/releases/download/${KEEP_SORTED_VERSION}/${asset}`;
    
    try {
        await downloadFile(url, binaryPath);
        
        // Make binary executable on Unix-like systems
        if (platform.platform !== 'win32') {
            chmodSync(binaryPath, 0o755);
        }
        
        console.log(`Successfully downloaded ${filename}`);
        
        // Create a mock binary if platform is not supported
        if (!platform.isSupported) {
            const mockScript = platform.platform === 'win32'
                ? '@echo off\necho Warning: This is a mock binary for unsupported platform\nexit /b 1'
                : '#!/bin/sh\necho "Warning: This is a mock binary for unsupported platform"\nexit 1';
            
            const mockPath = join(binDir, `${filename}.mock`);
            writeFileSync(mockPath, mockScript);
            if (platform.platform !== 'win32') {
                chmodSync(mockPath, 0o755);
            }
        }
    } catch (error) {
        console.error(`Failed to download binary: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
    }
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const downloadAll = args.includes('--all');
    
    if (downloadAll) {
        // Download binaries for all platforms
        for (const platform of Object.keys(PLATFORM_MAPPING)) {
            await downloadBinary({
                ...PLATFORM_MAPPING[platform],
                platform,
                arch: 'x64',
                isSupported: true
            });
        }
    } else {
        // Download binary for current platform
        await downloadBinary(getPlatformInfo());
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error('Failed to download binaries:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    });
}

export type { PlatformInfo, PlatformMapping };
export { downloadBinary, getPlatformInfo };