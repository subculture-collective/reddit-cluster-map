import { useState, useEffect, useRef, useCallback } from 'react';

interface SearchBarProps {
  onSelectNode: (nodeId: string) => void;
  className?: string;
}

interface SearchResult {
  id: string;
  name: string;
  val?: string;
  type?: string;
}

export default function SearchBar({ onSelectNode, className = '' }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Debounced search function using API
  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setIsOpen(false);
        return;
      }

      // Cancel previous request if still pending
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      setIsLoading(true);

      try {
        const startTime = performance.now();
        const apiUrl = import.meta.env.VITE_API_URL || '/api';
        const response = await fetch(
          `${apiUrl}/search?node=${encodeURIComponent(searchQuery)}&limit=10`,
          { signal: abortControllerRef.current.signal }
        );

        if (response.ok) {
          const data = await response.json();
          const endTime = performance.now();
          console.log(`Search completed in ${(endTime - startTime).toFixed(2)}ms`);

          const apiResults: SearchResult[] = data.results || [];
          setResults(apiResults);
          setIsOpen(true); // Always open to show results or "no results" message
          setSelectedIndex(0);
        }
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('API search failed:', error);
        }
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Handle input change with debouncing
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);

      // Clear previous timer
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      // Set new timer
      debounceTimer.current = setTimeout(() => {
        performSearch(value);
      }, 150);
    },
    [performSearch]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            selectNode(results[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          setQuery('');
          inputRef.current?.blur();
          break;
      }
    },
    [isOpen, results, selectedIndex]
  );

  // Select a node and focus on it
  const selectNode = useCallback(
    (result: SearchResult) => {
      onSelectNode(result.id);
      setQuery('');
      setIsOpen(false);
      setResults([]);
      inputRef.current?.blur();
    },
    [onSelectNode]
  );

  // Handle keyboard shortcut (Ctrl+K or /)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      // / key (only if not typing in another input)
      else if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get node color based on type
  const getNodeColor = (type?: string) => {
    switch (type) {
      case 'subreddit':
        return 'bg-green-500';
      case 'user':
        return 'bg-blue-500';
      case 'post':
        return 'bg-orange-500';
      case 'comment':
        return 'bg-pink-500';
      default:
        return 'bg-gray-500';
    }
  };

  // Get node icon based on type
  const getNodeIcon = (type?: string) => {
    switch (type) {
      case 'subreddit':
        return '🏷️';
      case 'user':
        return '👤';
      case 'post':
        return '📝';
      case 'comment':
        return '💬';
      default:
        return '🔹';
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Search nodes... (Ctrl+K or /)"
          className="w-full px-4 py-2 bg-black/60 text-white border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        )}
        {!isLoading && query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
              setIsOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full mt-2 w-full bg-black/90 border border-gray-700 rounded-lg shadow-xl max-h-96 overflow-y-auto z-50"
        >
          {results.map((result, index) => {
            const isSelected = index === selectedIndex;

            return (
              <button
                key={result.id}
                onClick={() => selectNode(result)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`w-full px-4 py-3 text-left flex items-center gap-3 border-b border-gray-800 last:border-b-0 transition-colors ${
                  isSelected ? 'bg-blue-600/30' : 'hover:bg-gray-800/50'
                }`}
              >
                <div className="flex-shrink-0 text-xl">{getNodeIcon(result.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium truncate">{result.name}</span>
                    <span
                      className={`px-2 py-0.5 text-xs rounded ${getNodeColor(
                        result.type
                      )} text-white flex-shrink-0`}
                    >
                      {result.type || 'unknown'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                    <span className="truncate">{result.id}</span>
                    {result.val !== undefined && (
                      <>
                        <span>•</span>
                        <span>weight: {result.val}</span>
                      </>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <div className="flex-shrink-0 text-blue-400 text-sm">↵</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {isOpen && query && results.length === 0 && !isLoading && (
        <div
          ref={dropdownRef}
          className="absolute top-full mt-2 w-full bg-black/90 border border-gray-700 rounded-lg shadow-xl px-4 py-3 text-gray-400 text-sm z-50"
        >
          No results found for "{query}"
        </div>
      )}
    </div>
  );
}
