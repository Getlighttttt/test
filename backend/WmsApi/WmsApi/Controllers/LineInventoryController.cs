using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WmsApi.Data;
using WmsApi.Models;

namespace WmsApi.Controllers;

[ApiController]
[Route("api/dispecer/lines")]
[Authorize(Roles = "Dispecer")]
public class LineInventoryController : ControllerBase
{
    private readonly Db1Context _db;

    public LineInventoryController(Db1Context db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetLines()
    {
        var activeLines = await _db.ProductionLines.AsNoTracking()
            .Where(line => line.IsActive).OrderBy(line => line.Code).ToListAsync();

        // Only pallets actually assigned to a known production line are counted.
        // A pending replenishment request is not stock on the line.
        var lineCodes = activeLines.Select(line => line.Code).ToList();
        var pallets = await _db.Pallets.AsNoTracking()
            .Include(p => p.Product)
            .Where(p => p.Status == PalletStatus.OnLine && lineCodes.Contains(p.LineName!))
            .ToListAsync();

        // Active lines appear even when they currently have no pallets.
        var lines = activeLines.Select(line =>
        {
            var assigned = pallets.Where(p => p.LineName == line.Code).ToList();
            return new
            {
                lineName = line.Code,
                lineTitle = line.Name,
                location = line.Location,
                palletCount = assigned.Count,
                materials = assigned
                    .GroupBy(p => p.ProductId)
                    .Select(group => new
                    {
                        productCode = group.First().Product!.Code,
                        productName = group.First().Product!.Name,
                        unit = group.First().Product!.Unit,
                        quantity = group.Sum(p => p.Quantity),
                        palletCount = group.Count()
                    })
                    .OrderBy(m => m.productCode)
                    .ToList(),
                pallets = assigned
                    .Select(p => new
                    {
                        palletCode = p.Code,
                        productCode = p.Product!.Code,
                        productName = p.Product.Name,
                        quantity = p.Quantity,
                        unit = p.Product.Unit,
                        status = p.Status
                    })
                    .OrderBy(p => p.palletCode)
                    .ToList()
            };
        }).ToList();

        return Ok(lines);
    }
}
