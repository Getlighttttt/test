using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WmsApi.Data;
using WmsApi.Models;

namespace WmsApi.Controllers;

/// <summary>
/// Read-only view of all pallets awaiting placement in warehouse storage.
/// Includes older RECEIVED pallets whose LocationId was left NULL before
/// LOC-REC1 was assigned on receipt.
/// </summary>
[ApiController]
[Route("api/receiving/area")]
[Authorize(Roles = "Skladnik")]
public class ReceivingAreaController : ControllerBase
{
    private readonly Db1Context _db;

    public ReceivingAreaController(Db1Context db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetWaitingPallets()
    {
        var pallets = await _db.Pallets
            .AsNoTracking()
            .Where(p => p.Status == PalletStatus.Received)
            .OrderBy(p => p.Code)
            .Select(p => new
            {
                code = p.Code,
                productCode = p.Product!.Code,
                productName = p.Product.Name,
                quantity = p.Quantity,
                unit = p.Product.Unit,
                locationCode = p.Location == null ? null : p.Location.Code,
                receiptStatus = p.Receipt == null ? "UNKNOWN" : p.Receipt.Status,
                orderNumber = p.Receipt == null ? null : p.Receipt.Order!.OrderNumber,
                canStore = p.Receipt == null ||
                    p.Receipt.Status == "OK" || p.Receipt.Status == "APPROVED"
            })
            .ToListAsync();

        return Ok(pallets);
    }
}
