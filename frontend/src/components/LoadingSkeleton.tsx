/**
 * LoadingSkeleton - Professional loading state with skeleton UI
 * Shows animated placeholders during initial graph load
 */

const LoadingSkeleton = () => {
  return (
    <div className="w-full h-screen bg-black relative overflow-hidden">
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-black to-slate-900 animate-pulse" />
      
      {/* Mock graph container */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-full h-full max-w-7xl max-h-[600px] mx-auto">
          {/* Skeleton nodes - pulsing circles */}
          <div className="absolute top-1/4 left-1/4 w-16 h-16 rounded-full bg-gradient-to-br from-green-500/30 to-green-600/10 animate-pulse" />
          <div className="absolute top-1/3 right-1/3 w-12 h-12 rounded-full bg-gradient-to-br from-blue-500/30 to-blue-600/10 animate-pulse delay-75" />
          <div className="absolute bottom-1/3 left-1/3 w-20 h-20 rounded-full bg-gradient-to-br from-green-500/30 to-green-600/10 animate-pulse delay-150" />
          <div className="absolute bottom-1/4 right-1/4 w-14 h-14 rounded-full bg-gradient-to-br from-blue-500/30 to-blue-600/10 animate-pulse delay-100" />
          <div className="absolute top-1/2 left-1/2 w-24 h-24 rounded-full bg-gradient-to-br from-green-500/30 to-green-600/10 animate-pulse delay-200" />
          
          {/* Skeleton links - faint lines */}
          <svg className="absolute inset-0 w-full h-full opacity-20">
            <line x1="25%" y1="25%" x2="33%" y2="33%" stroke="#4ade80" strokeWidth="2" className="animate-pulse" />
            <line x1="33%" y1="33%" x2="50%" y2="50%" stroke="#60a5fa" strokeWidth="2" className="animate-pulse delay-75" />
            <line x1="50%" y1="50%" x2="66%" y2="33%" stroke="#4ade80" strokeWidth="2" className="animate-pulse delay-150" />
            <line x1="50%" y1="50%" x2="33%" y2="66%" stroke="#60a5fa" strokeWidth="2" className="animate-pulse delay-100" />
          </svg>
        </div>
      </div>

      {/* Loading message */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="bg-black/70 backdrop-blur-sm rounded-lg px-8 py-6 border border-white/10 shadow-2xl max-w-md">
          {/* Spinner */}
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
          
          {/* Message */}
          <h2 className="text-white text-xl font-semibold text-center mb-2">
            Loading Graph
          </h2>
          <p className="text-gray-400 text-sm text-center mb-4">
            Preparing network visualization...
          </p>
          
          {/* Pulsing dots */}
          <div className="flex justify-center gap-1 mt-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingSkeleton;
