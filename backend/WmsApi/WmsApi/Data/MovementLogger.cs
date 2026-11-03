using WmsApi.Models;

namespace WmsApi.Data
{
    public class MovementLogger
    {
        private readonly Db2Context _db;
        public MovementLogger(Db2Context db) => _db = db;

        public async Task LogAsync(string eventType, string palletCode, string productCode, int quantity, string? fromZone, string? toZone, string? userName, string? Details, string? lineName = null)
        {
            var log1 = new MovementLog { EventType = eventType, PalletCode = palletCode, ProductCode = productCode, Quantity = quantity, FromZone = fromZone, ToZone = toZone, LineName = lineName, UserName = userName, Details = Details };
            _db.MovementLogs.Add(log1);
            await _db.SaveChangesAsync();
        }

    }
}
