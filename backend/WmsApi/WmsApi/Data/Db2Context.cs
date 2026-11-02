using Microsoft.EntityFrameworkCore;
using WmsApi.Models;

namespace WmsApi.Data;

public class Db2Context : DbContext
{
    public Db2Context(DbContextOptions<Db2Context> options) : base(options) { }

    public DbSet<MovementLog> MovementLogs => Set<MovementLog>();
}