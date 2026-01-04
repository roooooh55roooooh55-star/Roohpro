
import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Video, UserInteractions } from './types.ts';
import { downloadVideoWithProgress } from './offlineManager.ts';

export const LOGO_URL = "https://i.top4top.io/p_3643ksmii1.jpg";

const NEON_COLORS = [
  'shadow-[0_0_15px_rgba(220,38,38,0.5)] border-red-500',   // Red
  'shadow-[0_0_15px_rgba(34,211,238,0.5)] border-cyan-400',  // Cyan
  'shadow-[0_0_15px_rgba(234,179,8,0.5)] border-yellow-500', // Yellow
  'shadow-[0_0_15px_rgba(168,85,247,0.5)] border-purple-500', // Purple
  'shadow-[0_0_15px_rgba(34,197,94,0.5)] border-green-500',  // Green
  'shadow-[0_0_15px_rgba(37,99,235,0.5)] border-blue-500',   // Blue
];

const getNeonColor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return NEON_COLORS[Math.abs(hash) % NEON_COLORS.length];
};

export const getDeterministicStats = (seed: string) => {
  let hash = 0;
  if (!seed) return { views: 0, likes: 0 };
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const baseViews = Math.abs(hash % 900000) + 500000; 
  const views = baseViews * (Math.abs(hash % 5) + 2); 
  const likes = Math.abs(Math.floor(views * (0.12 + (Math.abs(hash % 15) / 100)))); 
  return { views, likes };
};

export const formatBigNumber = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

// دالة موحدة لقراءة وتجهيز الرابط قبل العرض
export const formatVideoSource = (video: Video) => {
  // إذا كان هناك رابط خارجي مضاف يدوياً (redirect_url)، نعطيه الأولوية
  if (video.redirect_url && video.redirect_url.trim() !== "") {
    // في حالة التشغيل المباشر قد نحتاج التعامل معه كـ iframe ولكن هنا نفترض أنه رابط فيديو مباشر
    // إذا كان رابط يوتيوب أو غيره للتوجيه، سيتم التعامل معه في النقر
    return video.video_url; 
  }
  
  // إذا كان الرابط من R2، نقوم بتنظيفه وإضافة وسام الوقت للسرعة
  let r2Url = video.video_url || "";
  if (r2Url.includes('r2.dev') || r2Url.includes('workers.dev')) {
    return r2Url.includes('#t=') ? r2Url : `${r2Url}#t=0.1`;
  }
  
  return r2Url;
};

const NeonTrendBadge = ({ is_trending }: { is_trending: boolean }) => {
  if (!is_trending) return null;
  return (
    <div className="absolute top-3 right-3 z-50 flex items-center gap-1.5 bg-red-600/90 px-2.5 py-1 rounded-xl shadow-[0_0_20px_rgba(220,38,38,0.6)] animate-pulse border border-red-400/50 backdrop-blur-sm">
      <span className="text-[8px] font-black text-white tracking-widest italic">TRENDING</span>
      <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping"></div>
    </div>
  );
};

const JoyfulNeonLion: React.FC<{ isDownloading: boolean, hasDownloads: boolean }> = ({ isDownloading, hasDownloads }) => (
  <div className="relative">
    {isDownloading && <div className="absolute inset-0 bg-yellow-400 blur-lg rounded-full opacity-40 animate-pulse"></div>}
    <svg 
      className={`w-8 h-8 transition-all duration-500 ${isDownloading ? 'text-yellow-400 scale-110 drop-shadow-[0_0_10px_#facc15]' : hasDownloads ? 'text-cyan-400 drop-shadow-[0_0_8px_#22d3ee]' : 'text-gray-600'}`} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="1.5"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21c4.97 0 9-4.03 9-9s-4.03-9-9-9-9 4.03-9 9 4.03 9 9 9z" />
      <path d="M8 9.5c0-1.5 1-2.5 4-2.5s4 1 4 2.5" strokeLinecap="round" />
      <circle cx="9.5" cy="11" r="0.8" fill="currentColor" />
      <circle cx="14.5" cy="11" r="0.8" fill="currentColor" />
      <path d="M10 15.5c.5 1 1.5 1.5 2 1.5s1.5-.5 2-1.5" strokeLinecap="round" />
    </svg>
  </div>
);

const VideoCardThumbnail: React.FC<{ 
  video: Video, 
  isOverlayActive: boolean, 
  interactions: UserInteractions,
  onLike?: (id: string) => void
}> = ({ video, isOverlayActive, interactions, onLike }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stats = useMemo(() => video ? getDeterministicStats(video.video_url) : { views: 0, likes: 0 }, [video?.video_url]);
  
  if (!video) return null;

  const isLiked = interactions?.likedIds?.includes(video.id) || false;
  const isSaved = interactions?.savedIds?.includes(video.id) || false;
  const watchItem = interactions?.watchHistory?.find(h => h.id === video.id);
  const progress = watchItem ? watchItem.progress : 0;
  const isHeartActive = isLiked || isSaved;
  const neonStyle = getNeonColor(video.id);
  
  // Use unified formatted source
  const formattedSrc = formatVideoSource(video);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isOverlayActive) {
      v.pause();
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    }, { threshold: 0.15 }); 
    observer.observe(v);
    return () => observer.disconnect();
  }, [video.video_url, isOverlayActive]);

  return (
    <div className={`w-full h-full relative bg-neutral-950 overflow-hidden group rounded-2xl border-2 transition-all duration-500 ${neonStyle} ${video.is_trending ? 'scale-[1.03] border-red-600 shadow-[0_0_20px_#dc2626]' : 'hover:scale-[1.01]'}`}>
      <video 
        ref={videoRef} 
        src={formattedSrc} 
        poster={video.poster_url} 
        muted 
        loop 
        playsInline 
        crossOrigin="anonymous" 
        preload="metadata"
        className="w-full h-full object-cover opacity-100 contrast-110 saturate-125 transition-all duration-700 pointer-events-none" 
      />
      
      <NeonTrendBadge is_trending={video.is_trending} />

      <div className="absolute top-2 right-2 flex flex-col items-center gap-1 z-30">
        <button 
          onClick={(e) => { e.stopPropagation(); onLike?.(video.id); }}
          className={`p-1.5 rounded-lg backdrop-blur-md border-2 transition-all duration-300 active:scale-90 ${isHeartActive ? 'bg-red-600/30 border-red-500 shadow-[0_0_12px_#ef4444]' : 'bg-black/40 border-white/20 hover:border-red-500/50'}`}
        >
          <svg className={`w-4 h-4 ${isHeartActive ? 'text-red-500' : 'text-gray-400'}`} fill={isHeartActive ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 z-20 pointer-events-none">
        <p className="text-white text-[10px] font-black line-clamp-1 italic text-right leading-tight drop-shadow-[0_2px_4_black]">{video.title}</p>
        <div className="flex items-center justify-end gap-1 mt-1">
          <span className="text-[7px] font-black text-white/80">{formatBigNumber(stats.likes)} الإعجابات</span>
        </div>
      </div>
      {progress > 0 && progress < 0.99 && (
        <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10 z-30">
          <div className="h-full bg-red-600 shadow-[0_0_12px_red]" style={{ width: `${progress * 100}%` }}></div>
        </div>
      )}
    </div>
  );
};

export const InteractiveMarquee: React.FC<{ 
  videos: Video[], 
  onPlay: (v: Video) => void,
  initialReverse?: boolean,
  isShorts?: boolean,
  interactions: UserInteractions,
}> = ({ videos, onPlay, initialReverse = false, isShorts = false, interactions }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftState, setScrollLeftState] = useState(0);
  const DEFAULT_SPEED = 0.8;
  const [internalSpeed, setInternalSpeed] = useState(initialReverse ? -DEFAULT_SPEED : DEFAULT_SPEED);
  const velX = useRef(0);
  const lastX = useRef(0);
  const lastTime = useRef(0);
  const requestRef = useRef<number>(null);

  const displayVideos = useMemo(() => {
    if (!videos || videos.length === 0) return [];
    return videos.length < 5 ? [...videos, ...videos, ...videos, ...videos] : [...videos, ...videos, ...videos];
  }, [videos]);

  const animate = useCallback(() => {
    const container = containerRef.current;
    if (container && !isDragging) {
      container.scrollLeft += internalSpeed;
      const { scrollLeft, scrollWidth } = container;
      if (scrollWidth > 0) {
        const thirdWidth = scrollWidth / 3;
        if (scrollLeft >= (thirdWidth * 2)) container.scrollLeft -= thirdWidth;
        else if (scrollLeft <= 1) container.scrollLeft += thirdWidth;
      }
    }
    requestRef.current = requestAnimationFrame(animate);
  }, [isDragging, internalSpeed]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [animate]);

  useEffect(() => {
    if (containerRef.current && videos?.length > 0) {
      const tid = setTimeout(() => {
        if (containerRef.current) containerRef.current.scrollLeft = containerRef.current.scrollWidth / 3;
      }, 150);
      return () => clearTimeout(tid);
    }
  }, [videos]);

  if (displayVideos.length === 0) return null;

  return (
    <div className={`relative overflow-hidden w-full ${isShorts ? 'h-64' : 'h-36'} bg-neutral-900/10 border-y border-white/5 animate-in fade-in duration-700 shadow-inner`} dir="ltr">
      <div 
        ref={containerRef}
        onMouseDown={(e) => { setIsDragging(true); setStartX(e.pageX - (containerRef.current?.offsetLeft || 0)); setScrollLeftState(containerRef.current?.scrollLeft || 0); lastX.current = e.pageX; lastTime.current = Date.now(); }}
        onMouseMove={(e) => { if (!isDragging || !containerRef.current) return; const x = e.pageX - (containerRef.current.offsetLeft || 0); containerRef.current.scrollLeft = scrollLeftState - (x - startX) * 1.5; const now = Date.now(); const dt = now - lastTime.current; if (dt > 0) velX.current = (e.pageX - lastX.current) / dt; lastX.current = e.pageX; lastTime.current = now; }}
        onMouseUp={() => { setIsDragging(false); if (Math.abs(velX.current) > 0.1) setInternalSpeed(velX.current > 0 ? -DEFAULT_SPEED : DEFAULT_SPEED); }}
        onMouseLeave={() => setIsDragging(false)}
        onTouchStart={(e) => { 
          if (!e.touches || e.touches.length === 0) return;
          const touch = e.touches[0];
          setIsDragging(true); 
          setStartX(touch.pageX - (containerRef.current?.offsetLeft || 0)); 
          setScrollLeftState(containerRef.current?.scrollLeft || 0); 
          lastX.current = touch.pageX; 
          lastTime.current = Date.now(); 
        }}
        onTouchMove={(e) => { 
          if (!isDragging || !containerRef.current || !e.touches || e.touches.length === 0) return; 
          const touch = e.touches[0];
          const x = touch.pageX - (containerRef.current.offsetLeft || 0); 
          containerRef.current.scrollLeft = scrollLeftState - (x - startX) * 1.5; 
          const now = Date.now(); 
          const dt = now - lastTime.current; 
          if (dt > 0) velX.current = (touch.pageX - lastX.current) / dt; 
          lastX.current = touch.pageX; 
          lastTime.current = now; 
        }}
        onTouchEnd={() => { setIsDragging(false); if (Math.abs(velX.current) > 0.1) setInternalSpeed(velX.current > 0 ? -DEFAULT_SPEED : DEFAULT_SPEED); }}
        className="flex gap-4 px-6 h-full items-center overflow-x-auto scrollbar-hide cursor-grab active:cursor-grabbing select-none"
      >
        {displayVideos.map((item, idx) => {
            // SAFEGUARD: Do not render if video is invalid
            if (!item || !item.video_url) return null;
            
            const neonStyle = getNeonColor(item.id);
            const formattedSrc = formatVideoSource(item);
            return (
              <div key={`${item.id}-${idx}`} onClick={() => !isDragging && onPlay(item)} className={`${isShorts ? 'w-36 h-56' : 'w-52 h-32'} shrink-0 rounded-2xl overflow-hidden border-2 relative active:scale-95 transition-all ${neonStyle} ${item.is_trending ? 'border-red-600 shadow-[0_0_15px_red]' : ''}`} dir="rtl">
                <video src={formattedSrc} muted loop playsInline autoPlay crossOrigin="anonymous" preload="metadata" className="w-full h-full object-cover opacity-100 contrast-110 saturate-125 pointer-events-none" />
                
                <NeonTrendBadge is_trending={item.is_trending} />

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5 backdrop-blur-[1px] pointer-events-none">
                  <p className="text-[10px] font-black text-white truncate italic text-right leading-none">{item.title}</p>
                </div>
              </div>
            );
        })}
      </div>
    </div>
  );
};

const MainContent: React.FC<any> = ({ 
  videos, categoriesList, interactions, onPlayShort, onPlayLong, onCategoryClick, onHardRefresh, onOfflineClick, loading, isOverlayActive, downloadProgress, syncStatus, onLike
}) => {
  const [pullOffset, setPullOffset] = useState(0);
  const [startY, setStartY] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [rotationKey, setRotationKey] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setRotationKey(k => k + 1), 15000);
    return () => clearInterval(timer);
  }, []);

  const safeVideos = useMemo(() => videos || [], [videos]);
  
  // Strict separation: Only "Shorts" in shorts list, Only "Long Video" in longs list.
  const shortsOnly = useMemo(() => safeVideos.filter((v: any) => v && v.video_type === 'Shorts'), [safeVideos]);
  const longsOnly = useMemo(() => safeVideos.filter((v: any) => v && v.video_type === 'Long Video'), [safeVideos]);

  const rotateSelection = useCallback((arr: any[], count: number, offset: number = 0) => {
    if (arr.length <= count) return arr;
    const start = ((rotationKey + offset) * count) % arr.length;
    let selected = arr.slice(start, start + count);
    if (selected.length < count) selected = [...selected, ...arr.slice(0, count - selected.length)];
    return selected;
  }, [rotationKey]);

  // Pass strictly filtered arrays to each section
  const featuredShorts1 = useMemo(() => rotateSelection(shortsOnly, 4, 0), [shortsOnly, rotateSelection]);
  const featuredLongs1 = useMemo(() => rotateSelection(longsOnly, 2, 0), [longsOnly, rotateSelection]);
  const featuredShorts2 = useMemo(() => rotateSelection(shortsOnly, 4, 1), [shortsOnly, rotateSelection]);

  const marqueeShorts1 = useMemo(() => rotateSelection(shortsOnly, 12, 0), [shortsOnly, rotateSelection]);
  const marqueeLongs1 = useMemo(() => rotateSelection(longsOnly, 8, 0), [longsOnly, rotateSelection]);
  const marqueeShorts2 = useMemo(() => rotateSelection(shortsOnly, 12, 2), [shortsOnly, rotateSelection]);
  const marqueeLongs2 = useMemo(() => rotateSelection(longsOnly, 8, 2), [longsOnly, rotateSelection]);
  const marqueeShorts3 = useMemo(() => rotateSelection(shortsOnly, 12, 3), [shortsOnly, rotateSelection]);
  const marqueeLongs3 = useMemo(() => rotateSelection(longsOnly, 8, 3), [longsOnly, rotateSelection]);

  const unfinishedVideos = useMemo(() => {
    if (!interactions?.watchHistory) return [];
    return interactions.watchHistory
      .filter((h: any) => h.progress > 0.05 && h.progress < 0.95)
      .map((h: any) => safeVideos.find((vid: any) => vid && (vid.id === h.id)))
      .filter((v: any) => v !== undefined && v !== null && v.video_url).reverse();
  }, [interactions?.watchHistory, safeVideos]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return safeVideos.filter((v: any) => 
      v && v.video_url && (v.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      v.category.toLowerCase().includes(searchQuery.toLowerCase()))
    ).slice(0, 15);
  }, [searchQuery, safeVideos]);

  const isActuallyRefreshing = loading || pullOffset > 30;

  return (
    <div 
      onTouchStart={(e) => window.scrollY === 0 && setStartY(e.touches[0].pageY)}
      onTouchMove={(e) => { if (startY === 0) return; const diff = e.touches[0].pageY - startY; if (diff > 0 && diff < 150) setPullOffset(diff); }}
      onTouchEnd={() => { if (pullOffset > 80) onHardRefresh(); setPullOffset(0); setStartY(0); }}
      className="flex flex-col pb-8 w-full bg-black min-h-screen relative"
      style={{ transform: `translateY(${pullOffset / 2}px)` }} dir="rtl"
    >
      <header className="flex items-center justify-between py-3 bg-black relative px-4 border-b border-white/5 shadow-lg">
        <div className="flex items-center gap-2" onClick={onHardRefresh}>
          <img src={LOGO_URL} className={`w-9 h-9 rounded-full border-2 transition-all duration-500 ${isActuallyRefreshing ? 'border-yellow-400 shadow-[0_0_20px_#facc15]' : 'border-red-600 shadow-[0_0_10px_red]'}`} />
          <h1 className={`text-base font-black italic transition-colors duration-500 ${isActuallyRefreshing ? 'text-yellow-400' : 'text-red-600'}`}>الحديقة المرعبة</h1>
        </div>
        <div className="flex items-center gap-3">
          {syncStatus && (
            <div className="flex flex-col items-center">
              <span className="text-[8px] font-black text-cyan-400 animate-pulse">مزامنة {syncStatus.current}/{syncStatus.total}</span>
              <div className="w-12 h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-cyan-400" style={{ width: `${(syncStatus.current / syncStatus.total) * 100}%` }}></div>
              </div>
            </div>
          )}
          <button onClick={() => setIsSearchOpen(true)} className="p-2.5 bg-white/5 border-2 border-white/10 text-white/70 hover:text-white transition-all active:scale-90 rounded-2xl shadow-md">
            <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </button>
          <button onClick={onOfflineClick} className="p-1 transition-all active:scale-90 relative group">
            <JoyfulNeonLion isDownloading={downloadProgress !== null} hasDownloads={interactions?.downloadedIds?.length > 0} />
          </button>
        </div>
      </header>

      <nav className="nav-container nav-mask relative h-14 bg-black/95 backdrop-blur-2xl z-[100] border-b border-white/10 sticky top-20 overflow-x-auto scrollbar-hide flex items-center">
        <div className="animate-marquee-train flex items-center gap-4 px-10">
          {[...(categoriesList || []), ...(categoriesList || [])].map((cat, idx) => (
            <button key={`${cat}-${idx}`} onClick={() => onCategoryClick(cat)} className="neon-white-led shrink-0 px-6 py-1.5 rounded-full text-[10px] font-black text-white italic whitespace-nowrap">{cat}</button>
          ))}
        </div>
      </nav>

      {syncStatus && (
        <div className="px-5 py-3 bg-cyan-950/20 border-y border-cyan-900/30 flex items-center justify-between">
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 bg-cyan-500 rounded-full animate-ping"></div>
             <span className="text-[9px] font-black text-cyan-400 italic">جاري تحميل المحتوى للخزنة...</span>
           </div>
           <span className="text-[9px] font-black text-white/60">{Math.round((syncStatus.current/syncStatus.total)*100)}%</span>
        </div>
      )}

      <SectionHeader title="ومضات مرعبة سريعة" color="bg-red-500" />
      <InteractiveMarquee videos={marqueeShorts1} onPlay={(v) => onPlayShort(v, shortsOnly)} isShorts={true} interactions={interactions} />

      <SectionHeader title="عرض الأساطير الطويلة" color="bg-cyan-500" />
      <InteractiveMarquee videos={marqueeLongs1} onPlay={(v) => onPlayLong(v, longsOnly)} interactions={interactions} />

      <SectionHeader title="المختار من القبو (شورتي)" color="bg-yellow-500" />
      <div className="px-4 grid grid-cols-2 gap-3.5">
        {featuredShorts1.map((v: any) => v && v.video_url && (
          <div key={v.id} onClick={() => onPlayShort(v, shortsOnly)} className="aspect-[9/16] animate-in fade-in duration-500">
            <VideoCardThumbnail video={v} interactions={interactions} isOverlayActive={isOverlayActive} onLike={onLike} />
          </div>
        ))}
      </div>

      <SectionHeader title="أهوال حصرية مختارة" color="bg-red-600" />
      <div className="px-4 space-y-3">
        {featuredLongs1.map((v: any) => v && v.video_url && (
          <div key={v.id} onClick={() => onPlayLong(v, longsOnly)} className="aspect-video w-full animate-in zoom-in-95 duration-500">
            <VideoCardThumbnail video={v} interactions={interactions} isOverlayActive={isOverlayActive} onLike={onLike} />
          </div>
        ))}
      </div>

      {unfinishedVideos.length > 0 && (
        <>
          <SectionHeader title="نكمل الحكاية" color="bg-purple-500" />
          <InteractiveMarquee videos={unfinishedVideos} onPlay={(v) => v.video_type === 'Shorts' ? onPlayShort(v, shortsOnly) : onPlayLong(v, longsOnly)} interactions={interactions} />
        </>
      )}

      <SectionHeader title="ومضات من الجحيم" color="bg-orange-500" />
      <InteractiveMarquee videos={marqueeShorts2} onPlay={(v) => onPlayShort(v, shortsOnly)} isShorts={true} interactions={interactions} initialReverse={true} />

      <SectionHeader title="حكايات القبور الطويلة" color="bg-emerald-500" />
      <InteractiveMarquee videos={marqueeLongs2} onPlay={(v) => onPlayLong(v, longsOnly)} interactions={interactions} initialReverse={true} />

      <SectionHeader title="همسات الظلام (شورتي)" color="bg-indigo-500" />
      <div className="px-4 grid grid-cols-2 gap-3.5">
        {featuredShorts2.map((v: any) => v && v.video_url && (
          <div key={`${v.id}-2`} onClick={() => onPlayShort(v, shortsOnly)} className="aspect-[9/16] animate-in fade-in duration-500">
            <VideoCardThumbnail video={v} interactions={interactions} isOverlayActive={isOverlayActive} onLike={onLike} />
          </div>
        ))}
      </div>

      <SectionHeader title="أرشيف الأهوال الأخير" color="bg-blue-600" />
      <InteractiveMarquee videos={marqueeShorts3} onPlay={(v) => onPlayShort(v, shortsOnly)} isShorts={true} interactions={interactions} />

      <SectionHeader title="الخروج من القبو" color="bg-white" />
      <InteractiveMarquee videos={marqueeLongs3} onPlay={(v) => onPlayLong(v, longsOnly)} interactions={interactions} />

      <div className="w-full h-8 bg-black flex items-center justify-center group relative border-y border-white/5 mt-4">
          <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest italic z-10">Vault Secure System</span>
      </div>

      {isSearchOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-300">
          <div className="p-4 flex items-center gap-4 border-b-2 border-white/10 bg-black">
            <button onClick={() => setIsSearchOpen(false)} className="p-3.5 text-red-600 border-2 border-red-600 rounded-2xl shadow-[0_0_20px_red] active:scale-75 transition-all bg-red-600/10">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
            <input 
              autoFocus
              type="text" 
              placeholder="ابحث في أرشيف الحديقة..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-white/5 border-2 border-white/10 rounded-2xl py-4.5 px-7 text-white text-base outline-none focus:border-red-600 transition-all font-black text-right shadow-inner"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {searchResults.length > 0 ? searchResults.map((v: any) => v && v.video_url && (
              <div key={v.id} onClick={() => { setIsSearchOpen(false); v.video_type === 'Shorts' ? onPlayShort(v, shortsOnly) : onPlayLong(v, longsOnly); }} className={`flex gap-4.5 p-4 bg-white/5 rounded-3xl border-2 active:scale-95 transition-all shadow-xl group ${getNeonColor(v.id)}`}>
                <div className="w-28 h-18 bg-black rounded-2xl overflow-hidden shrink-0 border-2 border-white/10 shadow-lg">
                  <video src={formatVideoSource(v)} crossOrigin="anonymous" preload="metadata" className="w-full h-full object-cover opacity-100 contrast-110 saturate-125 transition-opacity" />
                </div>
                <div className="flex flex-col justify-center flex-1">
                  <h3 className="text-sm font-black text-white italic line-clamp-1 text-right">{v.title}</h3>
                  <span className="text-[9px] text-red-500 font-black uppercase mt-1.5 text-right italic tracking-widest bg-red-600/10 self-end px-2 py-0.5 rounded-md border border-red-600/20">{v.category}</span>
                </div>
              </div>
            )) : searchQuery.trim() && (
              <div className="flex flex-col items-center justify-center py-24 opacity-30 gap-5 text-center">
                <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <p className="font-black italic text-lg">لا توجد نتائج لهذا الكابوس..</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const SectionHeader: React.FC<{ title: string, color: string }> = ({ title, color }) => (
  <div className="px-5 py-2 flex items-center gap-2.5">
    <div className={`w-1.5 h-3.5 ${color} rounded-full shadow-[0_0_12px_currentColor]`}></div>
    <h2 className="text-[11px] font-black text-white italic uppercase tracking-[0.15em] drop-shadow-md">{title}</h2>
  </div>
);

export default MainContent;
