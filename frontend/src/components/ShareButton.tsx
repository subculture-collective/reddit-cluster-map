/**
 * ShareButton component - generates and copies shareable URL with current state
 */

import { useState } from "react";
import { generateShareURL, type AppState } from "../utils/urlState";

interface Props {
  getState: () => AppState;
}

export default function ShareButton({ getState }: Props) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    try {
      const state = getState();
      const url = generateShareURL(state);
      
      if (!navigator.clipboard) {
        throw new Error("Clipboard API not available");
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy URL:", err);
      // Fallback for browsers that don't support clipboard API
      alert("Failed to copy to clipboard. Please copy the URL manually from the address bar.");
    }
  };

  return (
    <div className="absolute z-20 top-2 left-2">
      <button
        onClick={handleShare}
        className={`px-3 py-2 rounded border text-sm font-medium transition-colors shadow ${
          copied
            ? "bg-green-600 border-green-400 text-white"
            : "bg-blue-600 border-blue-400 text-white hover:bg-blue-700"
        }`}
        title="Copy shareable link to clipboard"
      >
        {copied ? "✓ Copied!" : "📋 Share Link"}
      </button>
    </div>
  );
}
