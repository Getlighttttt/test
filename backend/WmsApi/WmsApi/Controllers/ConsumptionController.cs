using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WmsApi.Data;
using WmsApi.Models;

namespace WmsApi.Controllers;

public record ConsumePalletRequest(string? PalletCode, DateTimeOffset ArrivedAt, int DurationMinutes);

[ApiController]
[Route("api/consumption")]
[Authorize(Roles = "Skladnik")]
public class ConsumptionController : ControllerBase
{
    private readonly Db1Context _db1;
    private readonly Db2Context _db2;

    public ConsumptionController(Db1Context db1, Db2Context db2)
        => (_db1, _db2) = (db1, db2);

    [HttpGet("pallets")]
    public async Task<IActionResult> GetPallets()
    {
        var pallets = await _db1.Pallets.AsNoTracking()
            .Where(p => p.Status == PalletStatus.OnLine &&
                       (p.LineName == "L1" || p.LineName == "L2"))
            .OrderBy(p => p.LineName)
            .ThenBy(p => p.Code)
            .Select(p => new
            {
                palletCode = p.Code,
                lineName = p.LineName,
                productCode = p.Product!.Code,
                productName = p.Product.Name,
                quantity = p.Quantity,
                unit = p.Product.Unit
            })
            .ToListAsync();

        return Ok(pallets);
    }

    [HttpPost]
    public async Task<IActionResult> Consume(ConsumePalletRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.PalletCode))
            return BadRequest(new { message = "Select a pallet." });

        if (req.DurationMinutes <= 0 || req.DurationMinutes > 10080)
            return BadRequest(new { message = "Duration must be between 1 and 10080 minutes." });

        if (req.ArrivedAt == default)
            return BadRequest(new { message = "Select an arrival time." });

        var periodStart = req.ArrivedAt.UtcDateTime;
        var periodEnd = periodStart.AddMinutes(req.DurationMinutes);
        var now = DateTime.UtcNow;

        if (periodStart > now || periodEnd > now.AddMinutes(1))
            return BadRequest(new { message = "The consumption interval cannot end in the future." });

        // Limit the date inference made by the time-only form to recent records.
        if (periodStart < now.AddDays(-7))
            return BadRequest(new { message = "Arrival time must be within the last 7 days." });

        var pallet = await _db1.Pallets.AsNoTracking()
            .Include(p => p.Product)
            .FirstOrDefaultAsync(p => p.Code == req.PalletCode);

        if (pallet == null)
            return NotFound(new { message = "Unknown pallet." });

        if (pallet.Status != PalletStatus.OnLine ||
            (pallet.LineName != "L1" && pallet.LineName != "L2"))
            return Conflict(new { message = "The pallet is not currently on L1 or L2." });

        // The pallet must be switched only once, even if the request is submitted twice.
        await using var db1Transaction = await _db1.Database.BeginTransactionAsync();
        var updated = await _db1.Pallets
            .Where(p => p.Id == pallet.Id && p.Status == PalletStatus.OnLine)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.Status, PalletStatus.Consumed));

        if (updated != 1)
            return Conflict(new { message = "This pallet has already been processed." });

        var product = pallet.Product!;
        var lineName = pallet.LineName!;

        _db2.LineConsumptionLogs.Add(new LineConsumptionLog
        {
            PalletCode = pallet.Code,
            ProductCode = product.Code,
            LineName = lineName,
            PeriodStart = periodStart,
            PeriodEnd = periodEnd,
            QuantityConsumed = pallet.Quantity,
            Unit = product.Unit,
            Source = "manual",
            RecordedAt = now
        });

        _db2.MovementLogs.Add(new MovementLog
        {
            EventType = "CONSUME",
            PalletCode = pallet.Code,
            ProductCode = product.Code,
            Quantity = pallet.Quantity,
            FromZone = Zone.LineBuffer,
            ToZone = null,
            LineName = lineName,
            UserName = User.Identity?.Name,
            Details = $"Line {lineName}; consumption duration {req.DurationMinutes} min"
        });

        // If DB2 cannot save the history, disposing the uncommitted DB1
        // transaction keeps the pallet ON_LINE so the operator can retry.
        await _db2.SaveChangesAsync();
        await db1Transaction.CommitAsync();

        return Ok(new
        {
            message = $"Pallet {pallet.Code} consumed on {lineName}.",
            palletCode = pallet.Code,
            lineName,
            periodStart,
            periodEnd
        });
    }
}
