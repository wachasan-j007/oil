/* ============================================================
   PTTOR Insight Dashboard — custom ECharts theme ("orInsight")
   Registered globally before app.js runs.

   IMPORTANT SCOPE: this theme intentionally only sets *fallback*
   color palette + font. It does NOT set grid.containLabel, axis
   line/split defaults, etc. Those structural theme defaults used
   to silently stack extra auto-padding on top of every chart's own
   fixed-pixel grid (grid:{left:80,right:20,...}), which is what
   caused charts across the app to shrink and show excess empty
   space. Structural/axis polish is handled per-chart in app.js's
   modernizeOption/modernizeAxis instead, which only fills in gaps
   the chart itself left undefined — much lower blast radius.
   ============================================================ */
(function () {
  if (typeof echarts === 'undefined') return;

  var orInsightTheme = {
    color: [
      '#60A5FA', '#23A27B', '#F4B740', '#E04040', '#A78BFA',
      '#38BDF8', '#FB923C', '#4ADE80', '#F472B6', '#94A3B8'
    ],
    backgroundColor: 'transparent',
    textStyle: {
      fontFamily: "'Prompt', -apple-system, BlinkMacSystemFont, sans-serif"
    }
  };

  echarts.registerTheme('orInsight', orInsightTheme);
  window.__orThemeRegistered = true;
})();

