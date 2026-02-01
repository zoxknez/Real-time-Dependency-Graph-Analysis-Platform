'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

type SbomFormat = 'SPDX' | 'CYCLONE_DX';
type SbomEncoding = 'JSON' | 'XML';

interface SbomExportButtonProps {
  projectName: string;
  projectVersion?: string;
  packageId?: string;
  onExport?: (format: SbomFormat, encoding: SbomEncoding) => Promise<void>;
  className?: string;
  disabled?: boolean;
}

interface FormatOption {
  value: SbomFormat;
  label: string;
  description: string;
  icon: React.ReactNode;
}

interface EncodingOption {
  value: SbomEncoding;
  label: string;
}

const formatOptions: FormatOption[] = [
  {
    value: 'SPDX',
    label: 'SPDX 2.3',
    description: 'ISO/IEC 5962:2021 standard',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    value: 'CYCLONE_DX',
    label: 'CycloneDX 1.5',
    description: 'OWASP standard format',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2"/>
        <path d="M12 4V2M12 22V20M20 12H22M2 12H4M17.6569 6.34315L19.0711 4.92893M4.92893 19.0711L6.34315 17.6569M17.6569 17.6569L19.0711 19.0711M4.92893 4.92893L6.34315 6.34315" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
];

const encodingOptions: EncodingOption[] = [
  { value: 'JSON', label: 'JSON' },
  { value: 'XML', label: 'XML' },
];

export function SbomExportButton({
  projectName,
  projectVersion = '1.0.0',
  packageId: _packageId,
  onExport,
  className,
  disabled = false,
}: SbomExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<SbomFormat>('CYCLONE_DX');
  const [selectedEncoding, setSelectedEncoding] = useState<SbomEncoding>('JSON');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      if (onExport) {
        await onExport(selectedFormat, selectedEncoding);
      } else {
        // Default export behavior - download file
        const filename = `${projectName}-${projectVersion}-sbom.${selectedEncoding.toLowerCase()}`;
        console.log(`Exporting SBOM: ${filename} in ${selectedFormat} format`);
        
        // In production, this would call the API
        // const response = await fetch(`/api/sbom/generate`, {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ 
        //     projectName, 
        //     projectVersion, 
        //     packageId,
        //     format: selectedFormat,
        //     encoding: selectedEncoding 
        //   }),
        // });
        // const blob = await response.blob();
        // downloadBlob(blob, filename);
      }
    } finally {
      setIsExporting(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || isExporting}
        className={cn(
          'inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50',
          className
        )}
      >
        <svg 
          className="h-4 w-4" 
          viewBox="0 0 24 24" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <path 
            d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M7 10L12 15M12 15L17 10M12 15V3" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
        </svg>
        {isExporting ? 'Generating...' : 'Export SBOM'}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border bg-popover p-4 shadow-lg">
            <h3 className="mb-3 font-semibold">Export SBOM</h3>
            
            {/* Format Selection */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                Format
              </label>
              <div className="space-y-2">
                {formatOptions.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-accent',
                      selectedFormat === option.value && 'border-primary bg-accent'
                    )}
                  >
                    <input
                      type="radio"
                      name="sbom-format"
                      value={option.value}
                      checked={selectedFormat === option.value}
                      onChange={() => setSelectedFormat(option.value)}
                      className="sr-only"
                    />
                    <div className="text-muted-foreground">{option.icon}</div>
                    <div className="flex-1">
                      <div className="font-medium">{option.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {option.description}
                      </div>
                    </div>
                    {selectedFormat === option.value && (
                      <svg className="h-5 w-5 text-primary" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Encoding Selection */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                Encoding
              </label>
              <div className="flex gap-2">
                {encodingOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setSelectedEncoding(option.value)}
                    className={cn(
                      'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                      selectedEncoding === option.value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'hover:bg-accent'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Export Info */}
            <div className="mb-4 rounded-md bg-muted p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Project:</span>
                <span className="font-medium">{projectName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Version:</span>
                <span className="font-medium">{projectVersion}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Output:</span>
                <span className="font-mono text-xs">
                  {projectName}-sbom.{selectedEncoding.toLowerCase()}
                </span>
              </div>
            </div>

            {/* Export Button */}
            <button 
              type="button"
              className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50" 
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle 
                      className="opacity-25" 
                      cx="12" 
                      cy="12" 
                      r="10" 
                      stroke="currentColor" 
                      strokeWidth="4" 
                      fill="none"
                    />
                    <path 
                      className="opacity-75" 
                      fill="currentColor" 
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Generating SBOM...
                </>
              ) : (
                <>Download {selectedFormat === 'SPDX' ? 'SPDX' : 'CycloneDX'} SBOM</>
              )}
            </button>

            {/* Format Info Links */}
            <div className="mt-3 flex justify-center gap-4 text-xs text-muted-foreground">
              <a 
                href="https://spdx.github.io/spdx-spec/v2.3/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-primary hover:underline"
              >
                SPDX Spec
              </a>
              <a 
                href="https://cyclonedx.org/docs/1.5/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-primary hover:underline"
              >
                CycloneDX Spec
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Compact version for toolbars
export function SbomExportIcon({
  projectName,
  projectVersion = '1.0.0',
  className,
}: Pick<SbomExportButtonProps, 'projectName' | 'projectVersion' | 'className'>) {
  const [isExporting, setIsExporting] = useState(false);

  const handleQuickExport = async () => {
    setIsExporting(true);
    // Quick export in CycloneDX JSON format
    console.log(`Quick export: ${projectName}-${projectVersion}-sbom.json`);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate
    setIsExporting(false);
  };

  return (
    <button
      onClick={handleQuickExport}
      disabled={isExporting}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-accent',
        isExporting && 'animate-pulse',
        className
      )}
      title="Export SBOM (CycloneDX)"
    >
      {isExporting ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
          <circle 
            className="opacity-25" 
            cx="12" 
            cy="12" 
            r="10" 
            stroke="currentColor" 
            strokeWidth="4" 
            fill="none"
          />
          <path 
            className="opacity-75" 
            fill="currentColor" 
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
          <path 
            d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M7 10L12 15M12 15L17 10M12 15V3" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
