using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using TaskManagement.DTOs;

namespace TaskManagement.Services
{
    public interface IOnlineUserTracker
    {
        void Add(string connectionId, OnlineUserDto user);
        OnlineUserDto? Remove(string connectionId);
        IReadOnlyList<OnlineUserDto> GetAll();
    }

    public class OnlineUserTracker : IOnlineUserTracker
    {
        private readonly ConcurrentDictionary<string, OnlineUserDto> _connections = new();

        public void Add(string connectionId, OnlineUserDto user) =>
            _connections[connectionId] = user;

        public OnlineUserDto? Remove(string connectionId) =>
            _connections.TryRemove(connectionId, out var user) ? user : null;

        public IReadOnlyList<OnlineUserDto> GetAll() =>
            _connections.Values.ToList();
    }
}
