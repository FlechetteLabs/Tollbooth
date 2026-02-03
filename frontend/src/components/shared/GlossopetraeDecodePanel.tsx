/**
 * Glossopetrae Decode Panel
 *
 * Shows decoded conlang text when Glossopetrae is available.
 * Displays a greyed-out button when not installed.
 */

import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../stores/appStore';
import {
  isGlossopetraeAvailable,
  decode,
  encode,
} from '../../utils/glossopetrae';

interface GlossopetraeDecodePanelProps {
  text: string;
  direction?: 'decode' | 'encode';  // decode = conlang→English, encode = English→conlang
  className?: string;
}

export function GlossopetraeDecodePanel({
  text,
  direction = 'decode',
  className,
}: GlossopetraeDecodePanelProps) {
  const {
    glossopetraeAvailable,
    glossopetraeEnabled,
    glossopetraeSeeds,
  } = useAppStore();

  const [isDecoding, setIsDecoding] = useState(false);
  const [decodedText, setDecodedText] = useState<string | null>(null);
  const [showDecoded, setShowDecoded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get active seeds
  const activeSeeds = glossopetraeSeeds.filter((s) => s.active).map((s) => s.seed);

  // Check if decode is possible
  const canDecode = glossopetraeAvailable && glossopetraeEnabled && activeSeeds.length > 0;

  const handleDecode = async () => {
    if (!canDecode || !text) return;

    setIsDecoding(true);
    setError(null);

    try {
      // Try each active seed
      for (const seed of activeSeeds) {
        const result = direction === 'decode'
          ? await decode(text, seed)
          : await encode(text, seed);

        if (result && result !== text) {
          setDecodedText(result);
          setShowDecoded(true);
          setIsDecoding(false);
          return;
        }
      }

      // No decode worked
      setError('Could not decode text with configured seeds');
      setDecodedText(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decode failed');
      setDecodedText(null);
    } finally {
      setIsDecoding(false);
    }
  };

  // Reset when text changes
  useEffect(() => {
    setDecodedText(null);
    setShowDecoded(false);
    setError(null);
  }, [text]);

  // Determine button state and text
  const getButtonState = () => {
    if (!glossopetraeAvailable) {
      return {
        disabled: true,
        text: 'Decode Glossopetrae',
        title: 'Glossopetrae not installed. Enable with ENABLE_GLOSSOPETRAE=true in docker-compose.',
        className: 'opacity-50 cursor-not-allowed',
      };
    }
    if (!glossopetraeEnabled) {
      return {
        disabled: true,
        text: 'Decode Glossopetrae',
        title: 'Glossopetrae disabled. Enable in Settings.',
        className: 'opacity-50 cursor-not-allowed',
      };
    }
    if (activeSeeds.length === 0) {
      return {
        disabled: true,
        text: 'Decode Glossopetrae',
        title: 'No seeds configured. Add seeds in Settings.',
        className: 'opacity-50 cursor-not-allowed',
      };
    }
    if (isDecoding) {
      return {
        disabled: true,
        text: 'Decoding...',
        title: 'Decoding in progress',
        className: 'opacity-75',
      };
    }
    if (showDecoded) {
      return {
        disabled: false,
        text: 'Hide Decoded',
        title: 'Hide decoded text',
        className: '',
      };
    }
    return {
      disabled: false,
      text: direction === 'decode' ? 'Decode Glossopetrae' : 'Encode Glossopetrae',
      title: direction === 'decode' ? 'Decode conlang text to English' : 'Encode English to conlang',
      className: '',
    };
  };

  const buttonState = getButtonState();

  return (
    <div className={clsx('mt-2', className)}>
      {/* Decode button */}
      <button
        onClick={() => {
          if (showDecoded) {
            setShowDecoded(false);
          } else {
            handleDecode();
          }
        }}
        disabled={buttonState.disabled}
        title={buttonState.title}
        className={clsx(
          'px-2 py-1 text-xs rounded border transition-colors',
          buttonState.disabled
            ? 'bg-gray-800 border-gray-700 text-gray-500'
            : 'bg-cyan-900/30 border-cyan-700 text-cyan-400 hover:bg-cyan-900/50',
          buttonState.className
        )}
      >
        🗣️ {buttonState.text}
      </button>

      {/* Error message */}
      {error && (
        <div className="mt-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Decoded content */}
      {showDecoded && decodedText && (
        <div className="mt-2 bg-cyan-900/30 border border-cyan-700 rounded-lg p-3">
          <div className="text-xs text-cyan-400 font-semibold mb-1">
            {direction === 'decode' ? 'Decoded' : 'Encoded'}
          </div>
          <div className="text-sm whitespace-pre-wrap break-all">
            {decodedText}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Inline decode indicator - shows a small icon when decoded content is available
 */
export function GlossopetraeIndicator({
  available,
  onClick,
}: {
  available: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!available}
      title={available ? 'Glossopetrae decode available' : 'Glossopetrae not available'}
      className={clsx(
        'text-xs',
        available ? 'text-cyan-400 hover:text-cyan-300' : 'text-gray-600'
      )}
    >
      🗣️
    </button>
  );
}
