namespace WmsApi.Models
{
    /// <summary>Body of POST /api/ml/alerts (JSON in camelCase).</summary>
    public record MlAlertDto
    {
        public int PredictionId { get; set; }
        public string ProductCode { get; set; } = string.Empty;
        public string LineName { get; set; } = string.Empty;
        public double RiskPercent { get; set; }
        public double Threshold { get; set; }
        public double? MinutesToStockout { get; set; }
        public int RecommendedQty { get; set; }
        public int Priority { get; set; } = 3;
        public string Message { get; set; } = string.Empty;
        public string? ModelVersion { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public record MlThresholdDto
    {
        public double CriticalThreshold { get; set; }
    }
}
